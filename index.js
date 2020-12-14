require("dotenv").config();
const { Reshuffle } = require("reshuffle");
const { GitHubConnector } = require("reshuffle-github-connector");
const {
  SlackConnector,
  SlackEventType,
  SlackEvents,
} = require("reshuffle-slack-connector");

(async () => {
  const app = new Reshuffle();
  //Github Config
  const github = new GitHubConnector(app, {
    token: process.env.GITHUB_TOKEN,
    runtimeBaseUrl: process.env.RUNTIME_BASE_URL,
  });
  const slackConnector = new SlackConnector(app, {
    token: process.env.SLACK_TOKEN,
    signingSecret: process.env.SLACK_SIGN_SECRET,
    port: 3000,
  });
  // const channel = "C01HCT0AK5W";

  const slackUsers = await (async () => {
    const webClient = await slackConnector.getWebClient();
    const { members } = await webClient.users.list();

    return members.map((member) => {
      return { name: member.profile.display_name, id: member.id };
    });
  })();

  github.on(
    {
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      githubEvent: "pull_request",
    },
    async (event, app) => {
      if (event.action === "opened" || event.action === "reopened") {
        const reviewers = event.pull_request.requested_reviewers.map(
          (reviewer) => {
            return reviewer.login;
          }
        );
        slackUsers.every(async ({ name, id }) => {
          if (reviewers.includes(name)) {
            await slackConnector.postMessage(
              id,
              `Please review this pull request - ${event.pull_request.html_url}`
            );
          } else {
            console.log(`${name} not included in reviewers list`);
          }
        });
      }
    }
  );

  app.start(8000);
})().catch(console.error);
