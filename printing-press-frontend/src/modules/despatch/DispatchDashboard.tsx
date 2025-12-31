import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { endpoints } from '../../services/endpoints'

type Job = {
  jobId: string
  customerName: string
  packingPreference: 'Single Parcel' | 'Multiple Parcels'
  paymentStatus: 'PAID' | 'UNPAID' | 'ADMIN_APPROVED'
}

export default function DispatchDashboard() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [rack, setRack] = useState<Record<string, string>>({})

  const loadJobs = async () => {
    const res = await api.get(endpoints.dispatchJobs)
    setJobs(res.data)
  }

  const dispatchJob = async (jobId: string) => {
    await api.post(`/api/dispatch/jobs/${jobId}/dispatch`, {
      rackLocation: rack[jobId]
    })
    loadJobs()
  }

  useEffect(() => {
    loadJobs()
  }, [])

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Dispatch Dashboard</h1>

      <table className="w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border p-2">Job ID</th>
            <th className="border p-2">Customer</th>
            <th className="border p-2">Packing</th>
            <th className="border p-2">Payment</th>
            <th className="border p-2">Rack</th>
            <th className="border p-2">Action</th>
          </tr>
        </thead>

        <tbody>
          {jobs.map((job) => {
            const canDispatch =
              job.paymentStatus === 'PAID' ||
              job.paymentStatus === 'ADMIN_APPROVED'

            return (
              <tr key={job.jobId}>
                <td className="border p-2">{job.jobId}</td>
                <td className="border p-2">{job.customerName}</td>
                <td className="border p-2">{job.packingPreference}</td>
                <td className="border p-2">{job.paymentStatus}</td>

                <td className="border p-2">
                  <input
                    className="border p-1 w-24"
                    placeholder="RACK-A1"
                    value={rack[job.jobId] || ''}
                    onChange={(e) =>
                      setRack({
                        ...rack,
                        [job.jobId]: e.target.value
                      })
                    }
                  />
                </td>

                <td className="border p-2 text-center">
                  {canDispatch ? (
                    <button
                      onClick={() => dispatchJob(job.jobId)}
                      className="bg-blue-600 text-white px-3 py-1 rounded"
                    >
                      Dispatch
                    </button>
                  ) : (
                    <span className="text-red-600 text-sm">
                      Payment Pending
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
