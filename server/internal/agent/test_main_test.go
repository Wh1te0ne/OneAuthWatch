package agent

import (
	"os"
	"testing"

	"github.com/Wh1te0ne/OneAuthWatch/server/internal/api"
)

// TestMain runs before all tests in the agent package. It enables test mode
// on the api package to prevent any keychain/keyring operations during tests.
// This ensures tests never read or write real Claude Code OAuth tokens.
func TestMain(m *testing.M) {
	api.SetTestMode(true)
	os.Exit(m.Run())
}
