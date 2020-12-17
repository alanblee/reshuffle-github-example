require("dotenv").config();
const { Reshuffle, CronConnector } = require("reshuffle");
const { GitHubConnector } = require("reshuffle-github-connector");
const { SlackConnector } = require("reshuffle-slack-connector");

(async () => {
  const app = new Reshuffle();
  // Cron config
  const cronConnector = new CronConnector(app);
  //Github Config
  const githubConnector = new GitHubConnector(app, {
    token: process.env.GITHUB_TOKEN,
    runtimeBaseUrl: process.env.RUNTIME_BASE_URL,
  });
  const slackConnector = new SlackConnector(app, {
    token: process.env.SLACK_TOKEN,
    signingSecret: process.env.SLACK_SIGN_SECRET,
    port: 3000,
  });

  // Fetch slack user list
  const slackUsers = await (async () => {
    const webClient = await slackConnector.getWebClient();
    const { members } = await webClient.users.list();
    let usersHash = {};

    members.forEach((member) => {
      usersHash[member.profile.display_name] = member.id;
    });
    return usersHash;
  })();

  // messaging helper
  const messageHelper = async (
    ghReviewers,
    slackList,
    prLink,
    pending = false
  ) => {
    if (ghReviewers.length == 0) {
      await slackConnector.postMessage(
        "general",
        `${pending ? "Pending pull request" : "New pull request"} - ${prLink}`
      );
    } else {
      ghReviewers.forEach(async ({ login }) => {
        if (slackList.hasOwnProperty(login)) {
          await slackConnector.postMessage(
            slackList[login],
            `${
              pending ? "* Pending review *" : "* New review requested *"
            } ${prLink}`
          );
        }
      });
    }
  };

  githubConnector.on(
    {
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      githubEvent: "pull_request",
    },
    async (event, app) => {
      const {
        pull_request: { requested_reviewers },
        pull_request: { html_url },
      } = event;
      if (["opened", "reopened"].includes(event.action)) {
        const reviewers = requested_reviewers.map((reviewer) => reviewer);
        // Fetch github requested reviewer list
        await messageHelper(reviewers, slackUsers, html_url);
      }
    }
  );
  // 0 12 * * 4 *
  //Check open PR's with cron connector
  cronConnector.on({ expression: "1 * * * * *" }, async (event, app) => {
    const { data } = await githubConnector.sdk().pulls.list({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      state: "open",
    });
    data.forEach(async ({ html_url, requested_reviewers: reviewers }) => {
      await messageHelper(reviewers, slackUsers, html_url, true);
    });
  });

  app.start(8000);
})().catch(console.error);
