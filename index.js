const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const axios = require('axios');

const validEvent = ['push', 'pull_request'];

async function validateSubscription() {
  let repoPrivate;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && fs.existsSync(eventPath)) {
    const payload = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    repoPrivate = payload?.repository?.private;
  }

  const upstream = 'deepakputhraya/action-branch-name';
  const action = process.env.GITHUB_ACTION_REPOSITORY;
  const docsUrl = 'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions';
  core.info('');
  core.info('\u001b[1;36mStepSecurity Maintained Action\u001b[0m');
  core.info(`Secure drop-in replacement for ${upstream}`);
  if (repoPrivate === false) core.info('\u001b[32m\u2713 Free for public repositories\u001b[0m');
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
  core.info('');
  if (repoPrivate === false) return;
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const body = { action: action || '' };
  if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl;
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body, { timeout: 3000 }
    );
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
      core.error(`\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`);
      core.error(`\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`);
      process.exit(1);
    }
    core.info('Timeout or API not reachable. Continuing to next step.');
  }
}

function getBranchName(eventName, payload) {
    let branchName;
    switch (eventName) {
        case 'push':
            branchName = payload.ref.replace('refs/heads/', '');
            break;
        case 'pull_request':
            branchName = payload.pull_request.head.ref;
            break;
        default:
            throw new Error(`Invalid event name: ${eventName}`);
    }
    return branchName;
}

async function run() {
    try {
        await validateSubscription();
        const eventName = github.context.eventName;
        core.info(`Event name: ${eventName}`);
        if (validEvent.indexOf(eventName) < 0) {
            core.setFailed(`Invalid event: ${eventName}`);
            return;
        }

        const branch = getBranchName(eventName, github.context.payload);
        core.info(`Branch name: ${branch}`);
        // Check if branch is to be ignored
        const ignore = core.getInput('ignore');
        if (ignore.length > 0 && ignore.split(',').some((el) => branch === el)) {
            core.info(`Skipping checks since ${branch} is in the ignored list - ${ignore}`);
            return
        }

        // Check if branch pass regex
        const regex = RegExp(core.getInput('regex'));
        core.info(`Regex: ${regex}`);
        if (!regex.test(branch)) {
            core.setFailed(`Branch ${branch} failed to pass match regex - ${regex}`);
            return
        }

        // Check if branch starts with a prefix
        const prefixes = core.getInput('allowed_prefixes');
        core.info(`Allowed Prefixes: ${prefixes}`);
        if (prefixes.length > 0 && !prefixes.split(',').some((el) => branch.startsWith(el))) {
            core.setFailed(`Branch ${branch} failed did not match any of the prefixes - ${prefixes}`);
            return
        }

        // Check min length
        const minLen = parseInt(core.getInput('min_length'));
        if (branch.length < minLen) {
            core.setFailed(`Branch ${branch} is smaller than min length specified - ${minLen}`);
            return
        }

        // Check max length
        const maxLen = parseInt(core.getInput('max_length'));
        if (maxLen > 0 && branch.length > maxLen) {
            core.setFailed(`Branch ${branch} is greater than max length specified - ${maxLen}`);
            return
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
