const HyperExpress = require('hyper-express');
const { createHmac } = require('node:crypto');

// https://www.npmjs.com/package/node-fetch#commonjs
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// server hostname and port
const hostname = process.env.SERVER_HOST || '0.0.0.0';
const port = process.env.SERVER_PORT || 3000;

// Bitbucket configuration
const bitbucket = {
  workspace: process.env.BITBUCKET_WORKSPACE || '',
  repository: process.env.BITBUCKET_REPOSITORY || '',
  branch: process.env.BITBUCKET_BRANCH || '',
  token: process.env.BITBUCKET_TOKEN || ''
};

// Localazy configuration
const localazy = {
  secret: process.env.LOCALAZY_WEBHOOK_SECRET || ''
};

// create a new server instance
const server = new HyperExpress.Server();

// handle post request
server.post('/', async (request, response) => {
  console.log('Processing incoming request');

  // request body
  const body = await request.text();

  // verify that the request is coming from Localazy
  const isVerified = verifySignature(request.headers, body, localazy.secret);

  if (isVerified) {
    console.log('Request signature has been verified');

    await startPipeline();
  } else {
    console.log('Cannot verify request signature. Check if you have correct webhook secret.');
  }

  // send empty 200 response
  response.header('Content-Type', 'text/plain');
  response.send('');
});

// start the server
server.listen(port, hostname).then(async () => {
  console.info('> Server running');
});

// verify the request signature
// https://localazy.com/docs/api/webhooks-api#security
const verifySignature = (headers, body, secret) => {
  const hmac = headers['x-localazy-hmac'] || '';
  const timestamp = headers['x-localazy-timestamp'] || '';
  const data = `${timestamp}-${body}`;

  const hash = createHmac('sha256', secret)
    .update(data)
    .digest('hex');

  return hmac === hash;
};

// start a Bitbucket pipeline
// https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pipelines/#api-repositories-workspace-repo-slug-pipelines-post
const startPipeline = async () => {
  console.log('Starting Bitbucket pipeline');

  const url = `https://api.bitbucket.org/2.0/repositories/${bitbucket.workspace}/${bitbucket.repository}/pipelines`;
  const method = 'POST';
  const body = JSON.stringify({
    target: {
      type: 'pipeline_ref_target',
      ref_type: 'branch',
      ref_name: bitbucket.branch
    }
  });
  const headers = {
    Authorization: `Bearer ${bitbucket.token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };

  let response;

  try {
    response = await fetch(url, { method, headers, body });
  } catch (e) {
    console.error(e);
  }

  if (response && response.status === 201 && response.statusText === 'Created') {
    console.log('Bitbucket pipeline successfully started');
  } else {
    console.log('Bitbucket pipeline failed to start');

    if (response && response.status && response.statusText) {
      console.log('Response', response.status, response.statusText);
    }
  }
};
