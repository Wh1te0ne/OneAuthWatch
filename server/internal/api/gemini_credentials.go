package api

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// GeminiCredentials contains parsed Gemini auth state.
type GeminiCredentials struct {
	AccessToken  string
	RefreshToken string
	IDToken      string
	ExpiresAt    time.Time
	ExpiresIn    time.Duration
}

// IsExpired returns true if the token has already expired.
func (c *GeminiCredentials) IsExpired() bool {
	if c.ExpiresAt.IsZero() {
		return false
	}
	return c.ExpiresIn <= 0
}

// IsExpiringSoon returns true if the token expires within the given duration.
func (c *GeminiCredentials) IsExpiringSoon(threshold time.Duration) bool {
	if c.ExpiresAt.IsZero() {
		return false
	}
	return c.ExpiresIn < threshold
}

// geminiOAuthCredsFile maps to ~/.gemini/oauth_creds.json
type geminiOAuthCredsFile struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	IDToken      string `json:"id_token"`
	Scope        string `json:"scope"`
	TokenType    string `json:"token_type"`
	ExpiryDate   int64  `json:"expiry_date"` // Unix milliseconds
}

// GeminiCredentialsPath returns the path to the Gemini OAuth credentials file.
func GeminiCredentialsPath() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return ""
	}
	return filepath.Join(home, ".gemini", "oauth_creds.json")
}

// GeminiTokenStore is the interface for DB-based token persistence.
// Implemented by store.Store.
type GeminiTokenStore interface {
	LoadGeminiTokens() (accessToken, refreshToken string, expiresAt int64, err error)
	SaveGeminiTokens(accessToken, refreshToken string, expiresAt int64) error
}

// DetectGeminiCredentials loads Gemini credentials.
// Priority: DB tokens (survives Docker restarts) > env vars > file.
// All sources are merged - higher priority takes precedence per field.
func DetectGeminiCredentials(logger *slog.Logger, tokenStore ...GeminiTokenStore) *GeminiCredentials {
	if logger == nil {
		logger = slog.Default()
	}

	// 1. DB tokens (highest priority - persisted across container restarts)
	var dbCreds *GeminiCredentials
	if len(tokenStore) > 0 && tokenStore[0] != nil {
		dbCreds = detectGeminiCredentialsFromDB(logger, tokenStore[0])
	}

	// 2. Env vars
	envCreds := detectGeminiCredentialsFromEnv(logger)

	// 3. File (~/.gemini/oauth_creds.json)
	fileCreds := detectGeminiCredentialsFromFile(logger)

	// Merge: DB > env > file
	return mergeGeminiCredentials(dbCreds, envCreds, fileCreds)
}

// detectGeminiCredentialsFromDB loads tokens persisted in the settings table.
func detectGeminiCredentialsFromDB(logger *slog.Logger, ts GeminiTokenStore) *GeminiCredentials {
	accessToken, refreshToken, expiresAtMs, err := ts.LoadGeminiTokens()
	if err != nil {
		logger.Debug("Gemini DB token load failed", "error", err)
		return nil
	}
	if accessToken == "" && refreshToken == "" {
		return nil
	}

	var expiresAt time.Time
	var expiresIn time.Duration
	if expiresAtMs > 0 {
		expiresAt = time.UnixMilli(expiresAtMs)
		expiresIn = time.Until(expiresAt)
	}

	logger.Debug("Gemini credentials loaded from DB",
		"has_access_token", accessToken != "",
		"has_refresh_token", refreshToken != "",
		"expires_in", expiresIn.Round(time.Minute))

	return &GeminiCredentials{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresAt:    expiresAt,
		ExpiresIn:    expiresIn,
	}
}

// mergeGeminiCredentials merges credentials from multiple sources.
// Earlier sources take precedence per field.
func mergeGeminiCredentials(sources ...*GeminiCredentials) *GeminiCredentials {
	merged := &GeminiCredentials{}
	hasAny := false
	for _, src := range sources {
		if src == nil {
			continue
		}
		hasAny = true
		if merged.AccessToken == "" && src.AccessToken != "" {
			merged.AccessToken = src.AccessToken
		}
		if merged.RefreshToken == "" && src.RefreshToken != "" {
			merged.RefreshToken = src.RefreshToken
		}
		if merged.ExpiresAt.IsZero() && !src.ExpiresAt.IsZero() {
			merged.ExpiresAt = src.ExpiresAt
			merged.ExpiresIn = src.ExpiresIn
		}
		if merged.IDToken == "" && src.IDToken != "" {
			merged.IDToken = src.IDToken
		}
	}
	if !hasAny {
		return nil
	}
	if merged.AccessToken == "" && merged.RefreshToken == "" {
		return nil
	}
	return merged
}

// detectGeminiCredentialsFromEnv loads credentials from GEMINI_REFRESH_TOKEN or GEMINI_ACCESS_TOKEN env vars.
func detectGeminiCredentialsFromEnv(logger *slog.Logger) *GeminiCredentials {
	refreshToken := strings.TrimSpace(os.Getenv("GEMINI_REFRESH_TOKEN"))
	accessToken := strings.TrimSpace(os.Getenv("GEMINI_ACCESS_TOKEN"))

	if refreshToken == "" && accessToken == "" {
		return nil
	}

	logger.Debug("Gemini credentials loaded from environment variables",
		"has_refresh_token", refreshToken != "",
		"has_access_token", accessToken != "")

	return &GeminiCredentials{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	}
}

// detectGeminiCredentialsFromFile loads credentials from ~/.gemini/oauth_creds.json.
func detectGeminiCredentialsFromFile(logger *slog.Logger) *GeminiCredentials {
	credPath := GeminiCredentialsPath()
	if credPath == "" {
		logger.Debug("Gemini credentials path unavailable")
		return nil
	}

	data, err := os.ReadFile(credPath)
	if err != nil {
		if !os.IsNotExist(err) {
			logger.Debug("Gemini credentials file not readable", "path", credPath, "error", err)
		}
		return nil
	}

	var creds geminiOAuthCredsFile
	if err := json.Unmarshal(data, &creds); err != nil {
		logger.Debug("Gemini credentials file parse failed", "path", credPath, "error", err)
		return nil
	}

	accessToken := strings.TrimSpace(creds.AccessToken)
	if accessToken == "" {
		logger.Debug("Gemini credentials file has no access token", "path", credPath)
		return nil
	}

	var expiresAt time.Time
	var expiresIn time.Duration
	if creds.ExpiryDate > 0 {
		expiresAt = time.UnixMilli(creds.ExpiryDate)
		expiresIn = time.Until(expiresAt)
	}

	result := &GeminiCredentials{
		AccessToken:  accessToken,
		RefreshToken: strings.TrimSpace(creds.RefreshToken),
		IDToken:      strings.TrimSpace(creds.IDToken),
		ExpiresAt:    expiresAt,
		ExpiresIn:    expiresIn,
	}

	if !expiresAt.IsZero() {
		logger.Debug("Gemini credentials loaded",
			"path", credPath,
			"expires_in", expiresIn.Round(time.Minute),
			"has_refresh_token", result.RefreshToken != "")
	}

	return result
}

// DetectGeminiToken returns the access token when available.
func DetectGeminiToken(logger *slog.Logger) string {
	creds := DetectGeminiCredentials(logger)
	if creds == nil {
		return ""
	}
	return creds.AccessToken
}

// GeminiClientCredentials holds OAuth client ID and secret for token refresh.
type GeminiClientCredentials struct {
	ClientID     string
	ClientSecret string
}

func detectGeminiClientCredentialsFromCLI() *GeminiClientCredentials {
	for _, bundleDir := range geminiCLIBundleDirs() {
		creds := detectGeminiClientCredentialsFromBundle(bundleDir)
		if creds != nil {
			return creds
		}
	}

	return nil
}

func geminiCLIBundleDirs() []string {
	seen := make(map[string]struct{})
	var dirs []string
	add := func(path string) {
		path = strings.TrimSpace(path)
		if path == "" {
			return
		}
		path = filepath.Clean(path)
		if _, ok := seen[path]; ok {
			return
		}
		if info, err := os.Stat(path); err == nil && info.IsDir() {
			seen[path] = struct{}{}
			dirs = append(dirs, path)
		}
	}

	if appData := strings.TrimSpace(os.Getenv("APPDATA")); appData != "" {
		add(filepath.Join(appData, "npm", "node_modules", "@google", "gemini-cli", "bundle"))
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		add(filepath.Join(home, ".npm-global", "lib", "node_modules", "@google", "gemini-cli", "bundle"))
		add(filepath.Join(home, ".local", "share", "pnpm", "global", "5", "node_modules", "@google", "gemini-cli", "bundle"))
	}
	if runtime.GOOS != "windows" {
		add("/usr/local/lib/node_modules/@google/gemini-cli/bundle")
		add("/opt/homebrew/lib/node_modules/@google/gemini-cli/bundle")
		add("/usr/lib/node_modules/@google/gemini-cli/bundle")
	}

	for _, pathDir := range filepath.SplitList(os.Getenv("PATH")) {
		pathDir = strings.TrimSpace(pathDir)
		if pathDir == "" {
			continue
		}
		for _, name := range geminiExecutableNames() {
			shimPath := filepath.Join(pathDir, name)
			bundleDir := detectGeminiBundleDirFromShim(shimPath)
			if bundleDir != "" {
				add(bundleDir)
			}
		}
	}

	return dirs
}

func geminiExecutableNames() []string {
	if runtime.GOOS == "windows" {
		return []string{"gemini.cmd", "gemini.ps1", "gemini"}
	}
	return []string{"gemini"}
}

func detectGeminiBundleDirFromShim(shimPath string) string {
	content, err := os.ReadFile(shimPath)
	if err != nil {
		return ""
	}

	text := string(content)
	if !strings.Contains(text, "@google") || !strings.Contains(text, "gemini-cli") {
		return ""
	}

	parent := filepath.Dir(shimPath)
	bundleDir := filepath.Join(parent, "node_modules", "@google", "gemini-cli", "bundle")
	if info, err := os.Stat(bundleDir); err == nil && info.IsDir() {
		return bundleDir
	}

	return ""
}

func detectGeminiClientCredentialsFromBundle(bundleDir string) *GeminiClientCredentials {
	entries, err := os.ReadDir(bundleDir)
	if err != nil {
		return nil
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasPrefix(name, "oauth2-provider-") || !strings.HasSuffix(name, ".js") {
			continue
		}
		content, err := os.ReadFile(filepath.Join(bundleDir, name))
		if err != nil {
			continue
		}
		clientID := extractGeminiGoogleClientID(string(content))
		clientSecret := extractGeminiGoogleClientSecret(string(content))
		if clientID != "" && clientSecret != "" {
			return &GeminiClientCredentials{
				ClientID:     clientID,
				ClientSecret: clientSecret,
			}
		}
	}

	return nil
}

func extractGeminiGoogleClientID(text string) string {
	const suffix = ".apps.googleusercontent.com"

	idx := strings.Index(text, suffix)
	for idx >= 0 {
		start := idx
		for start > 0 {
			ch := text[start-1]
			if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_' || ch == '.' {
				start--
				continue
			}
			break
		}
		candidate := strings.TrimSpace(text[start : idx+len(suffix)])
		if strings.Count(candidate, ".apps.googleusercontent.com") == 1 && strings.Contains(candidate, "-") {
			return candidate
		}
		next := strings.Index(text[idx+len(suffix):], suffix)
		if next < 0 {
			break
		}
		idx += len(suffix) + next
	}

	return ""
}

func extractGeminiGoogleClientSecret(text string) string {
	const prefix = "GOCSPX-"

	idx := strings.Index(text, prefix)
	if idx < 0 {
		return ""
	}

	end := idx + len(prefix)
	for end < len(text) {
		ch := text[end]
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_' {
			end++
			continue
		}
		break
	}

	return strings.TrimSpace(text[idx:end])
}

// DetectGeminiClientCredentials returns client credentials for OAuth refresh.
// Priority: OneAuthWatch env vars > legacy env vars > installed Gemini CLI bundle.
func DetectGeminiClientCredentials() *GeminiClientCredentials {
	clientID := strings.TrimSpace(os.Getenv("ONEAUTHWATCH_GEMINI_CLIENT_ID"))
	if clientID == "" {
		clientID = strings.TrimSpace(os.Getenv("GEMINI_CLIENT_ID"))
	}
	clientSecret := strings.TrimSpace(os.Getenv("ONEAUTHWATCH_GEMINI_CLIENT_SECRET"))
	if clientSecret == "" {
		clientSecret = strings.TrimSpace(os.Getenv("GEMINI_CLIENT_SECRET"))
	}

	if clientID == "" || clientSecret == "" {
		return detectGeminiClientCredentialsFromCLI()
	}

	return &GeminiClientCredentials{
		ClientID:     clientID,
		ClientSecret: clientSecret,
	}
}
