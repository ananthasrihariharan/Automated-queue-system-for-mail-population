import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { endpoints } from '../../services/endpoints'

type Job = {
  jobId: string
  customerName: string
  paymentStatus: 'UNPAID' | 'PAID'
}

export default function CashierDashboard() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  const loadJobs = async () => {
    const res = await api.get(endpoints.cashierJobs)
    setJobs(res.data)
    setLoading(false)
  }

  const markPaid = async (jobId: string) => {
    await api.patch(endpoints.markPaid(jobId))
    loadJobs()
  }

  useEffect(() => {
    loadJobs()
  }, [])

  if (loading) {
    return <div className="p-6">Loading...</div>
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Cashier Dashboard</h1>

      <table className="w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border p-2 text-left">Job ID</th>
            <th className="border p-2 text-left">Customer</th>
            <th className="border p-2 text-left">Payment</th>
            <th className="border p-2 text-center">Action</th>
          </tr>
        </thead>

        <tbody>
          {jobs.map((job) => (
            <tr key={job.jobId}>
              <td className="border p-2">{job.jobId}</td>
              <td className="border p-2">{job.customerName}</td>
              <td className="border p-2">{job.paymentStatus}</td>
              <td className="border p-2 text-center">
                {job.paymentStatus === 'UNPAID' ? (
                  <button
                    onClick={() => markPaid(job.jobId)}
                    className="bg-green-600 text-white px-3 py-1 rounded"
                  >
                    Mark Paid
                  </button>
                ) : (
                  <span className="text-gray-500">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
