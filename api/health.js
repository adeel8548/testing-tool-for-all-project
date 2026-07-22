/* global process */
export default function handler(_request, response) {
  response.status(200).json({
    status: 'ok',
    workerConfigured: Boolean(process.env.PLATFORM_ACCESS_KEY),
    timestamp: new Date().toISOString()
  });
}
