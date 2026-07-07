/**
 * microserviceClient.js
 *
 * Thin HTTP client for calling optional microservices (press, post-press, finishing).
 * If the service is unavailable (503 / connection refused), callers catch the error
 * and fall back to the local jobWorkflow functions â€” so the main system always works
 * even when no microservice is running.
 */

const axios = require('axios')

/**
 * Call a microservice endpoint.
 *
 * @param {string}  baseUrl   - e.g. process.env.PRESS_SERVICE_URL ("http://localhost:4001")
 * @param {string}  method    - HTTP method: 'get' | 'post' | 'patch' | 'put' | 'delete'
 * @param {string}  endpoint  - Path, e.g. "/api/press/jobs"
 * @param {object}  [opts]
 * @param {object}  [opts.query]  - Query-string params (added as ?key=value)
 * @param {object}  [opts.body]   - Request body for POST/PATCH
 * @param {number}  [opts.timeout=5000] - Timeout in ms
 *
 * @returns {Promise<any>} Parsed response data
 * @throws  {{ status: 503 }}  when the service is unreachable
 * @throws  {{ status: number, message: string }} for other HTTP errors
 */
async function callMicroservice(baseUrl, method, endpoint, opts = {}) {
  if (!baseUrl) {
    // No service URL configured â€” signal 503 so caller falls back gracefully
    const err = new Error('Microservice URL not configured')
    err.status = 503
    throw err
  }

  const { query, body, timeout = 5000 } = opts

  try {
    const response = await axios({
      method,
      url: `${baseUrl.replace(/\/$/, '')}${endpoint}`,
      params: query,
      data: body,
      timeout,
    })
    return response.data
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || !err.response) {
      // Service is down â€” return 503 so caller can fall back to local logic
      const fallback = new Error(`Microservice unavailable: ${baseUrl}`)
      fallback.status = 503
      throw fallback
    }

    // HTTP error from the service (4xx / 5xx)
    const status = err.response?.status || 500
    const message = err.response?.data?.message || err.message || 'Microservice error'
    const httpErr = new Error(message)
    httpErr.status = status
    throw httpErr
  }
}

module.exports = { callMicroservice }

