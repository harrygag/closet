# Deployment Setup Guide

This guide walks you through setting up automated deployments for Virtual Closet Arcade.

## Prerequisites

- GitHub repository created
- Vercel account (free tier works)
- Git installed locally

---

## Step 1: Set Up Vercel Project

### 1.1 Create Vercel Account
1. Go to [vercel.com](https://vercel.com)
2. Sign up with GitHub (recommended for easier integration)

### 1.2 Install Vercel CLI
```bash
npm install -g vercel@latest
```

### 1.3 Link Project to Vercel
```bash
cd closet-react
vercel login
vercel link
```

Follow the prompts:
- Set up and deploy? **Y**
- Which scope? Select your account
- Link to existing project? **N**
- Project name? `virtual-closet-arcade`
- Directory? `./` (current directory)

### 1.4 Get Vercel Credentials
```bash
# Get your Vercel token
vercel whoami

# Then visit: https://vercel.com/account/tokens
# Create a new token named "GitHub Actions"
# Copy the token (you'll need it for GitHub secrets)
```

**Get Project IDs:**
```bash
# After linking, check .vercel/project.json
cat .vercel/project.json
```

You'll see:
```json
{
  "orgId": "team_xxxxxxxxxxxxx",
  "projectId": "prj_xxxxxxxxxxxxx"
}
```

---

## Step 2: Configure GitHub Secrets

### 2.1 Navigate to Repository Settings
1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**

### 2.2 Add Required Secrets

Add these three secrets:

**Secret 1: VERCEL_TOKEN**
- Name: `VERCEL_TOKEN`
- Value: The token from Step 1.4
- Click **Add secret**

**Secret 2: VERCEL_ORG_ID**
- Name: `VERCEL_ORG_ID`
- Value: The `orgId` from `.vercel/project.json`
- Click **Add secret**

**Secret 3: VERCEL_PROJECT_ID**
- Name: `VERCEL_PROJECT_ID`
- Value: The `projectId` from `.vercel/project.json`
- Click **Add secret**

### 2.3 Verify Secrets
You should see three secrets listed:
- ✅ VERCEL_TOKEN
- ✅ VERCEL_ORG_ID
- ✅ VERCEL_PROJECT_ID

---

## Step 3: Enable Branch Protection (Optional but Recommended)

### 3.1 Protect Main Branch
1. Go to **Settings** → **Branches**
2. Click **Add branch protection rule**
3. Branch name pattern: `main`

### 3.2 Configure Protection Rules
Enable these settings:
- ✅ **Require pull request reviews before merging**
  - Required approvals: 1
- ✅ **Require status checks to pass before merging**
  - Select: `Quality Gates` (after first PR)
- ✅ **Require branches to be up to date before merging**
- ✅ **Include administrators**
- ❌ **Allow force pushes** (disabled)
- ❌ **Allow deletions** (disabled)

Click **Create** or **Save changes**

---

## Step 4: Test the Deployment Pipeline

### 4.1 Create a Test Branch
```bash
git checkout -b test-deployment
```

### 4.2 Make a Small Change
```bash
# Edit README or any file
echo "# Test deployment" >> closet-react/README.md
git add .
git commit -m "test: verify CI/CD pipeline"
git push origin test-deployment
```

### 4.3 Create Pull Request
1. Go to GitHub repository
2. Click **Pull requests** → **New pull request**
3. Base: `main` ← Compare: `test-deployment`
4. Click **Create pull request**

### 4.4 Verify CI/CD Workflow
The following should happen automatically:

**GitHub Actions Checks:**
- ✅ Quality Gates job starts
  - TypeScript check
  - ESLint
  - Tests
  - Build
  - Bundle size check
- ✅ Lighthouse audit (if enabled)
- ✅ Deploy Preview job
  - Vercel preview deployment created
  - Comment added to PR with preview URL

**Expected Timeline:** 5-10 minutes for all checks

### 4.5 Test Preview Deployment
1. Click the preview URL in the PR comment
2. Verify the app works correctly
3. Test on mobile viewport
4. Check browser console for errors

### 4.6 Merge to Production
If everything looks good:
1. Click **Merge pull request**
2. Confirm merge
3. Production deployment starts automatically
4. GitHub release created with version tag

**Production URL:** Check Vercel dashboard or GitHub Actions output

---

## Step 5: Verify Production Deployment

### 5.1 Check Vercel Dashboard
1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click on `virtual-closet-arcade` project
3. Verify:
   - ✅ Production deployment successful
   - ✅ Build logs clean
   - ✅ No errors

### 5.2 Test Production Site
Visit your production URL (shown in Vercel dashboard):
- Test all features
- Check mobile responsiveness
- Verify PWA installation works
- Test offline mode (if PWA enabled)

### 5.3 Monitor Performance
Check Vercel Analytics:
1. Go to project → Analytics tab
2. Monitor:
   - Page load times
   - Core Web Vitals
   - Error rates
   - Traffic patterns

---

## Step 6: Set Up Custom Domain (Optional)

### 6.1 Add Domain in Vercel
1. Vercel Dashboard → Your Project
2. Click **Settings** → **Domains**
3. Add your domain (e.g., `closet.yourdomain.com`)

### 6.2 Configure DNS
Vercel will provide DNS records to add:

**For subdomain (recommended):**
```
Type: CNAME
Name: closet
Value: cname.vercel-dns.com
```

**For apex domain:**
```
Type: A
Name: @
Value: 76.76.21.21
```

### 6.3 Wait for DNS Propagation
- Typical time: 1-24 hours
- Check status in Vercel dashboard
- Test with: `dig closet.yourdomain.com`

---

## Troubleshooting

### Build Fails on Vercel

**Error: "Command failed with exit code 1"**
```bash
# Run build locally first
cd closet-react
npm run build

# If local build succeeds but Vercel fails,
# check Node.js version in vercel.json:
{
  "buildCommand": "npm run build",
  "framework": "vite"
}
```

### GitHub Actions Timeout

**Error: "The job running on runner has exceeded the maximum execution time"**

Solution: Check these in `.github/workflows/ci.yml`:
```yaml
jobs:
  quality-gates:
    timeout-minutes: 10  # Increase if needed
```

### Preview Deployment Not Created

**Check:**
1. Secrets are set correctly in GitHub
2. Vercel project is linked
3. Check GitHub Actions logs for errors

**Fix:**
```bash
# Re-link Vercel project
cd closet-react
vercel link --yes

# Get new credentials
cat .vercel/project.json

# Update GitHub secrets with new IDs
```

### Lighthouse Scores Too Low

**If Lighthouse CI fails:**

Edit `closet-react/lighthouserc.json`:
```json
{
  "ci": {
    "assert": {
      "assertions": {
        "categories:performance": ["warn", {"minScore": 0.8}],
        "categories:accessibility": ["warn", {"minScore": 0.85}]
      }
    }
  }
}
```

Temporarily lower thresholds, then improve app performance.

---

## Daily Workflow

### For Regular Development

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make Changes & Commit**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   git push origin feature/my-feature
   ```

3. **Create Pull Request**
   - CI/CD runs automatically
   - Preview deployment created
   - Review code changes

4. **Merge to Main**
   - Merging triggers production deployment
   - Monitor deployment in Vercel

### For Hotfixes

1. **Create Hotfix Branch from Main**
   ```bash
   git checkout main
   git pull
   git checkout -b hotfix/critical-bug
   ```

2. **Fix & Deploy Quickly**
   ```bash
   git add .
   git commit -m "fix: resolve critical bug"
   git push origin hotfix/critical-bug
   ```

3. **Fast-Track PR**
   - Get quick review
   - Merge immediately
   - Production deploys in ~5 minutes

---

## Monitoring & Maintenance

### Weekly Checks

- **Vercel Dashboard:**
  - Review analytics
  - Check error rates
  - Monitor performance metrics

- **GitHub Actions:**
  - Review failed workflows
  - Update dependencies if needed
  - Check security alerts

### Monthly Tasks

- **Update Dependencies**
  ```bash
  npm outdated
  npm update
  npm audit fix
  ```

- **Review Lighthouse Scores**
  - Run manual audit
  - Optimize if scores drop
  - Update thresholds if needed

- **Check Bundle Size**
  ```bash
  npm run build
  # Check dist/ folder size
  ```

---

## Security Best Practices

### Secrets Management
- ✅ Never commit secrets to Git
- ✅ Use GitHub Secrets for CI/CD
- ✅ Rotate Vercel tokens quarterly
- ✅ Use environment-specific secrets

### Access Control
- ✅ Enable 2FA on GitHub
- ✅ Enable 2FA on Vercel
- ✅ Limit repository collaborators
- ✅ Review access logs regularly

### Deployment Safety
- ✅ Always test in preview before production
- ✅ Keep main branch protected
- ✅ Require code reviews
- ✅ Monitor production after deployments

---

## Quick Reference

### Useful Commands

```bash
# Deploy to preview
vercel

# Deploy to production
vercel --prod

# Check deployment status
vercel ls

# View project settings
vercel project ls

# Check logs
vercel logs [deployment-url]

# Run CI checks locally
npm run typecheck
npm run lint
npm run test
npm run build
```

### Important URLs

- **Vercel Dashboard:** https://vercel.com/dashboard
- **GitHub Actions:** https://github.com/[user]/[repo]/actions
- **Vercel Docs:** https://vercel.com/docs
- **Lighthouse CI Docs:** https://github.com/GoogleChrome/lighthouse-ci

---

## Success Checklist

After completing this guide, you should have:

- ✅ Vercel project linked and configured
- ✅ GitHub secrets set up correctly
- ✅ Branch protection rules enabled
- ✅ CI/CD pipeline working (tested with PR)
- ✅ Preview deployments working
- ✅ Production deployments working
- ✅ Lighthouse CI passing
- ✅ Custom domain configured (optional)

---

**🎉 Deployment pipeline is ready!**

Your app will now automatically:
- Run quality checks on every PR
- Deploy previews for testing
- Deploy to production on merge to main
- Create releases with version tags
