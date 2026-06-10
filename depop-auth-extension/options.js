// Load saved settings
document.addEventListener('DOMContentLoaded', async () => {
  const settings = await chrome.storage.local.get([
    'captchaSolverService',
    'captchaSolverApiKey',
    'autoSolveCaptchas',
    'firebaseSync'
  ]);

  document.getElementById('solver-service').value = settings.captchaSolverService || 'anticaptcha';
  document.getElementById('api-key').value = settings.captchaSolverApiKey || 'a82e50010533fadeef0ccb483f58bbb7';
  document.getElementById('auto-solve').checked = settings.autoSolveCaptchas !== false;
  document.getElementById('auto-sync').checked = settings.firebaseSync?.enabled !== false;
});

// Save settings
document.getElementById('save-btn').addEventListener('click', async () => {
  const service = document.getElementById('solver-service').value;
  const apiKey = document.getElementById('api-key').value;
  const autoSolve = document.getElementById('auto-solve').checked;
  const autoSync = document.getElementById('auto-sync').checked;

  try {
    await chrome.storage.local.set({
      captchaSolverService: service,
      captchaSolverApiKey: apiKey,
      autoSolveCaptchas: autoSolve,
      firebaseSync: {
        enabled: autoSync,
        lastToggled: new Date().toISOString()
      }
    });

    showStatus('✅ Settings saved successfully!', 'success');

    // Test API key
    if (apiKey) {
      showStatus('🔄 Testing API key...', 'success');
      // You could add API key validation here
    }
  } catch (error) {
    showStatus('❌ Failed to save settings: ' + error.message, 'error');
  }
});

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'status ' + type;

  setTimeout(() => {
    status.className = 'status';
  }, 3000);
}
