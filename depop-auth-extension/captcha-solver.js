/**
 * Captcha Solver for Depop
 * Handles various captcha challenges (reCAPTCHA, hCaptcha, etc.)
 */

const SOLVER_API_KEY = ''; // Will be set by user in options
const SOLVER_SERVICE = 'anticaptcha'; // anticaptcha, 2captcha, capsolver

/**
 * Detect captcha type on page
 */
function detectCaptcha() {
  // Check for reCAPTCHA
  if (document.querySelector('.g-recaptcha') ||
      document.querySelector('[data-sitekey]') ||
      document.querySelector('iframe[src*="recaptcha"]')) {
    return {
      type: 'recaptcha',
      version: document.querySelector('.g-recaptcha-response') ? 'v2' : 'v3',
      sitekey: extractSiteKey('recaptcha')
    };
  }

  // Check for hCaptcha
  if (document.querySelector('.h-captcha') ||
      document.querySelector('iframe[src*="hcaptcha"]')) {
    return {
      type: 'hcaptcha',
      sitekey: extractSiteKey('hcaptcha')
    };
  }

  // Check for Cloudflare Turnstile
  if (document.querySelector('[data-turnstile-sitekey]') ||
      document.querySelector('iframe[src*="challenges.cloudflare.com"]')) {
    return {
      type: 'turnstile',
      sitekey: extractSiteKey('turnstile')
    };
  }

  return null;
}

/**
 * Extract sitekey from page
 */
function extractSiteKey(type) {
  let sitekey = null;

  switch (type) {
    case 'recaptcha':
      const recaptchaDiv = document.querySelector('.g-recaptcha') ||
                          document.querySelector('[data-sitekey]');
      sitekey = recaptchaDiv?.getAttribute('data-sitekey');
      break;

    case 'hcaptcha':
      const hcaptchaDiv = document.querySelector('.h-captcha') ||
                         document.querySelector('[data-sitekey]');
      sitekey = hcaptchaDiv?.getAttribute('data-sitekey');
      break;

    case 'turnstile':
      const turnstileDiv = document.querySelector('[data-turnstile-sitekey]');
      sitekey = turnstileDiv?.getAttribute('data-turnstile-sitekey');
      break;
  }

  return sitekey;
}

/**
 * Solve captcha using external service
 */
async function solveCaptcha(captchaInfo, pageUrl) {
  const apiKey = await getCaptchaSolverApiKey();

  if (!apiKey) {
    throw new Error('Captcha solver API key not configured');
  }

  const service = await getCaptchaSolverService();

  switch (service) {
    case 'anticaptcha':
      return await solveWithAnticaptcha(captchaInfo, pageUrl, apiKey);
    case '2captcha':
      return await solveWith2Captcha(captchaInfo, pageUrl, apiKey);
    case 'capsolver':
      return await solveWithCapsolver(captchaInfo, pageUrl, apiKey);
    default:
      throw new Error(`Unknown solver service: ${service}`);
  }
}

/**
 * Solve with Anti-Captcha service
 */
async function solveWithAnticaptcha(captchaInfo, pageUrl, apiKey) {
  const endpoint = 'https://api.anti-captcha.com';

  // Create task
  const taskData = {
    clientKey: apiKey,
    task: captchaInfo.type === 'recaptcha' ? {
      type: captchaInfo.version === 'v2' ? 'RecaptchaV2TaskProxyless' : 'RecaptchaV3TaskProxyless',
      websiteURL: pageUrl,
      websiteKey: captchaInfo.sitekey,
      ...(captchaInfo.version === 'v3' && { minScore: 0.3 })
    } : captchaInfo.type === 'hcaptcha' ? {
      type: 'HCaptchaTaskProxyless',
      websiteURL: pageUrl,
      websiteKey: captchaInfo.sitekey
    } : {
      type: 'TurnstileTaskProxyless',
      websiteURL: pageUrl,
      websiteKey: captchaInfo.sitekey
    }
  };

  const createResponse = await fetch(`${endpoint}/createTask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(taskData)
  });

  const createResult = await createResponse.json();

  if (createResult.errorId > 0) {
    throw new Error(createResult.errorDescription);
  }

  const taskId = createResult.taskId;

  // Poll for result
  return await pollAnticaptchaResult(endpoint, apiKey, taskId);
}

async function pollAnticaptchaResult(endpoint, apiKey, taskId, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

    const response = await fetch(`${endpoint}/getTaskResult`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientKey: apiKey,
        taskId: taskId
      })
    });

    const result = await response.json();

    if (result.errorId > 0) {
      throw new Error(result.errorDescription);
    }

    if (result.status === 'ready') {
      return {
        success: true,
        solution: result.solution.gRecaptchaResponse || result.solution.token
      };
    }
  }

  throw new Error('Captcha solving timeout');
}

/**
 * Solve with 2Captcha service
 */
async function solveWith2Captcha(captchaInfo, pageUrl, apiKey) {
  const endpoint = 'https://2captcha.com';

  const params = new URLSearchParams({
    key: apiKey,
    method: captchaInfo.type === 'recaptcha' ? 'userrecaptcha' :
            captchaInfo.type === 'hcaptcha' ? 'hcaptcha' : 'turnstile',
    googlekey: captchaInfo.sitekey,
    pageurl: pageUrl,
    json: '1'
  });

  if (captchaInfo.type === 'recaptcha' && captchaInfo.version === 'v3') {
    params.append('version', 'v3');
    params.append('min_score', '0.3');
  }

  const submitResponse = await fetch(`${endpoint}/in.php?${params}`);
  const submitResult = await submitResponse.json();

  if (submitResult.status !== 1) {
    throw new Error(submitResult.request);
  }

  const captchaId = submitResult.request;

  // Poll for result
  return await poll2CaptchaResult(endpoint, apiKey, captchaId);
}

async function poll2CaptchaResult(endpoint, apiKey, captchaId, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds

    const params = new URLSearchParams({
      key: apiKey,
      action: 'get',
      id: captchaId,
      json: '1'
    });

    const response = await fetch(`${endpoint}/res.php?${params}`);
    const result = await response.json();

    if (result.status === 1) {
      return {
        success: true,
        solution: result.request
      };
    }

    if (result.request !== 'CAPCHA_NOT_READY') {
      throw new Error(result.request);
    }
  }

  throw new Error('Captcha solving timeout');
}

/**
 * Solve with CapSolver service
 */
async function solveWithCapsolver(captchaInfo, pageUrl, apiKey) {
  const endpoint = 'https://api.capsolver.com';

  const taskData = {
    clientKey: apiKey,
    task: {
      type: captchaInfo.type === 'recaptcha' ?
            (captchaInfo.version === 'v2' ? 'ReCaptchaV2TaskProxyLess' : 'ReCaptchaV3TaskProxyLess') :
            captchaInfo.type === 'hcaptcha' ? 'HCaptchaTaskProxyLess' :
            'AntiTurnstileTaskProxyLess',
      websiteURL: pageUrl,
      websiteKey: captchaInfo.sitekey
    }
  };

  const createResponse = await fetch(`${endpoint}/createTask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(taskData)
  });

  const createResult = await createResponse.json();

  if (createResult.errorId) {
    throw new Error(createResult.errorDescription);
  }

  const taskId = createResult.taskId;

  // Poll for result
  return await pollCapsolverResult(endpoint, apiKey, taskId);
}

async function pollCapsolverResult(endpoint, apiKey, taskId, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

    const response = await fetch(`${endpoint}/getTaskResult`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientKey: apiKey,
        taskId: taskId
      })
    });

    const result = await response.json();

    if (result.errorId) {
      throw new Error(result.errorDescription);
    }

    if (result.status === 'ready') {
      return {
        success: true,
        solution: result.solution.gRecaptchaResponse || result.solution.token
      };
    }
  }

  throw new Error('Captcha solving timeout');
}

/**
 * Get API key from storage
 */
async function getCaptchaSolverApiKey() {
  const result = await chrome.storage.local.get('captchaSolverApiKey');
  return result.captchaSolverApiKey || '';
}

/**
 * Get solver service from storage
 */
async function getCaptchaSolverService() {
  const result = await chrome.storage.local.get('captchaSolverService');
  return result.captchaSolverService || 'anticaptcha';
}

/**
 * Set API key in storage
 */
async function setCaptchaSolverApiKey(apiKey) {
  await chrome.storage.local.set({ captchaSolverApiKey: apiKey });
}

/**
 * Set solver service in storage
 */
async function setCaptchaSolverService(service) {
  await chrome.storage.local.set({ captchaSolverService: service });
}

/**
 * Submit captcha solution to page
 */
function submitCaptchaSolution(solution, captchaInfo) {
  if (captchaInfo.type === 'recaptcha') {
    // Set response in textarea
    const textarea = document.querySelector('#g-recaptcha-response, [name="g-recaptcha-response"]');
    if (textarea) {
      textarea.value = solution;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Trigger callback if exists
    const callback = window.___grecaptcha_cfg?.clients?.[0]?.callback;
    if (callback && typeof callback === 'function') {
      callback(solution);
    }
  } else if (captchaInfo.type === 'hcaptcha') {
    // Set response in textarea
    const textarea = document.querySelector('[name="h-captcha-response"]');
    if (textarea) {
      textarea.value = solution;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Trigger callback if exists
    if (window.hcaptcha && window.hcaptcha.setResponse) {
      window.hcaptcha.setResponse(solution);
    }
  } else if (captchaInfo.type === 'turnstile') {
    // Set response in input
    const input = document.querySelector('[name="cf-turnstile-response"]');
    if (input) {
      input.value = solution;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}
