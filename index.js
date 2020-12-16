require("dotenv").config();
const { Reshuffle, CronConnector } = require("reshuffle");
const { GitHubConnector } = require("reshuffle-github-connector");
const {
  SlackConnector,
  SlackEventType,
  SlackEvents,
} = require("reshuffle-slack-connector");

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
  // const channel = "C01HCT0AK5W";

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
  console.log(slackUsers);
  githubConnector.on(
    {
      owner: process.env.GITHUB_OWNER, // github repo owner
      repo: process.env.GITHUB_REPO, // repo name
      githubEvent: "pull_request",
    },
    async (event, app) => {
      if (event.action === "opened" || event.action === "reopened") {
        const reviewers = event.pull_request.requested_reviewers.map(
          (reviewer) => {
            return reviewer.login;
          }
        );
        // Fetch github requested reviewer list
        if (reviewers.length == 0) {
          await slackConnector.postMessage(
            "general",
            `New pull request - ${event.pull_request.html_url}`
          );
        } else {
          reviewers.forEach(async (login) => {
            if (slackUsers.hasOwnProperty(login)) {
              await slackConnector.postMessage(
                slackUsers[login],
                `*** New pull request *** - Please review - ${new Date(
                  event.pull_request.created_at
                )} - ${event.pull_request.html_url}`
              );
            }
          });
        }
      }
    }
  );

  // 0 12 * * 4 *
  //Check open PR's with cron connector
  cronConnector.on({ expression: "1 * * * * *" }, async (event, app) => {
    const { data } = await githubConnector.sdk().pulls.list({
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
    });

    data.forEach(
      async ({ created_at, html_url, requested_reviewers: reviewers }) => {
        if (reviewers.length == 0) {
          await slackConnector.postMessage(
            "general",
            `Pending pull request - ${html_url}`
          );
        } else {
          reviewers.forEach(async ({ login }) => {
            if (slackUsers.hasOwnProperty(login)) {
              await slackConnector.postMessage(
                slackUsers[login],
                `** Pending review ** pull requests from ${new Date(
                  created_at
                )} - ${html_url}`
              );
            }
          });
        }
      }
    );
  });

  app.start(8000);
})().catch(console.error);
