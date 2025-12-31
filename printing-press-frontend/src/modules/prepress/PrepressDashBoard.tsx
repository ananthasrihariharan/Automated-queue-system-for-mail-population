import { useEffect, useState } from 'react'
import { api } from '../../services/api'

type Job = {
  jobId: string
  customerName: string
  totalItems: number
  paymentStatus: string
  createdAt: string
  itemScreenshots: string[]
}


const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

export default function PrepressDashboard() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [previewJob, setPreviewJob] = useState<Job | null>(null)

  const loadJobs = async () => {
    const res = await api.get('/api/prepress/jobs')
    setJobs(res.data)
    setLoading(false)
  }

  useEffect(() => {
    loadJobs()
  }, [])

  if (loading) return <div className="p-6">Loading...</div>

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Prepress Dashboard</h1>
        <a
          href="/prepress/create"
          className="bg-black text-white px-4 py-2 rounded"
        >
          + Create Job
        </a>
      </div>

      {/* Preview Modal */}
      {previewJob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold">Job Details: {previewJob.jobId}</h2>
              <button
                onClick={() => setPreviewJob(null)}
                className="text-gray-500 hover:text-black text-xl font-bold"
              >
                &times;
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-sm text-gray-500">Customer</p>
                <p className="font-medium">{previewJob.customerName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Items</p>
                <p className="font-medium">{previewJob.totalItems}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Created At</p>
                <p className="font-medium">{new Date(previewJob.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Payment Status</p>
                <span className={`px-2 py-1 rounded text-xs font-semibold ${previewJob.paymentStatus === 'PAID' ? 'bg-green-100 text-green-800' :
                  previewJob.paymentStatus === 'ADMIN_APPROVED' ? 'bg-blue-100 text-blue-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                  {previewJob.paymentStatus}
                </span>
              </div>
            </div>

            <div>
              <h3 className="font-bold mb-2">Item Screenshots ({previewJob.itemScreenshots.length})</h3>
              {previewJob.itemScreenshots.length > 0 ? (
                <div className="grid grid-cols-2 bg-gray-50 p-4 rounded gap-4">
                  {previewJob.itemScreenshots.map((path, idx) => (
                    <div key={idx} className="border rounded overflow-hidden bg-white">
                      <img
                        src={`${BACKEND_URL}/${path.replace(/\\/g, '/')}`}
                        alt={`Item ${idx + 1}`}
                        className="w-full h-auto object-contain"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 italic">No screenshots uploaded.</p>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setPreviewJob(null)}
                className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <table className="w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border p-2">Job ID</th>
            <th className="border p-2">Customer</th>
            <th className="border p-2">Items</th>
            <th className="border p-2">Payment</th>
            <th className="border p-2">Created</th>
            <th className="border p-2">Actions</th>
          </tr>
        </thead>

        <tbody>
          {jobs.map((job) => (
            <tr key={job.jobId}>
              <td className="border p-2">{job.jobId}</td>
              <td className="border p-2">{job.customerName}</td>
              <td className="border p-2">{job.totalItems}</td>
              <td className="border p-2">{job.paymentStatus}</td>
              <td className="border p-2">
                {new Date(job.createdAt).toLocaleDateString()}
              </td>
              <td className="border p-2 text-center">
                <button
                  className="text-blue-600 underline"
                  onClick={() => setPreviewJob(job)}
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
