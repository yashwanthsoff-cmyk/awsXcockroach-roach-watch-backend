export const evalCases = [
  {
    id: "eval-1",
    service: "checkout-service",
    description: "Checkout is timing out and connections to the database seem maxed out",
    expectMatch: true,
    expectedTopic: "connection pool exhaustion",
  },
  {
    id: "eval-2",
    service: "payments-api",
    description: "Getting a lot of 503s from payments, looks like the DB connection limit is hit",
    expectMatch: true,
    expectedTopic: "connection pool exhaustion",
  },
  {
    id: "eval-3",
    service: "email-service",
    description: "Marketing emails stuck in queue, SMTP login seems to be rejecting our credentials",
    expectMatch: true,
    expectedTopic: "SMTP authentication failure",
  },
  {
    id: "eval-4",
    service: "wiki-service",
    description: "Internal wiki search returns a 500 error whenever a user filters results by more than two tags at once",
    expectMatch: false,
    expectedTopic: "no prior match - novel issue",
  },
  {
    id: "eval-5",
    service: "backup-service",
    description: "Nightly backup job completes successfully but silently skips the audit_logs table every third run",
    expectMatch: false,
    expectedTopic: "no prior match - novel issue",
  },
];
