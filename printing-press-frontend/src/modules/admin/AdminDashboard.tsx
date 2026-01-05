import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import EmployeeManager from './EmployeeManager'

type Job = {
  jobId: string
  customerName: string
  paymentStatus: string
  jobStatus: string
  adminApprovalNote?: string
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'jobs' | 'employees'>('jobs')
  const [jobs, setJobs] = useState<Job[]>([])
  const [note, setNote] = useState<Record<string, string>>({})

  const loadJobs = async () => {
    const res = await api.get('/api/admin/jobs')
    setJobs(res.data)
  }

  const approve = async (jobId: string) => {
    await api.patch(`/api/admin/jobs/${jobId}/approve-dispatch`, {
      note: note[jobId]
    })
    loadJobs()
  }

  useEffect(() => {
    if (activeTab === 'jobs') {
      loadJobs()
    }
  }, [activeTab])

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>

      {/* TABS */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setActiveTab('jobs')}
          className={`px-4 py-2 border ${
            activeTab === 'jobs'
              ? 'bg-black text-white'
              : 'bg-white'
          }`}
        >
          Jobs
        </button>

        <button
          onClick={() => setActiveTab('employees')}
          className={`px-4 py-2 border ${
            activeTab === 'employees'
              ? 'bg-black text-white'
              : 'bg-white'
          }`}
        >
          Employees
        </button>
      </div>

      {/* TAB CONTENT */}
      {activeTab === 'jobs' && (
        <table className="w-full border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border p-2">Job ID</th>
              <th className="border p-2">Customer</th>
              <th className="border p-2">Payment</th>
              <th className="border p-2">Admin Note</th>
              <th className="border p-2">Action</th>
            </tr>
          </thead>

          <tbody>
            {jobs.map((job) => (
              <tr key={job.jobId}>
                <td className="border p-2">{job.jobId}</td>
                <td className="border p-2">{job.customerName}</td>
                <td className="border p-2">{job.paymentStatus}</td>

                <td className="border p-2">
                  {job.paymentStatus === 'UNPAID' ? (
                    <input
                      className="border p-1 w-full"
                      placeholder="Approval note"
                      onChange={(e) =>
                        setNote({
                          ...note,
                          [job.jobId]: e.target.value
                        })
                      }
                    />
                  ) : (
                    job.adminApprovalNote || '—'
                  )}
                </td>

                <td className="border p-2 text-center">
                  {job.paymentStatus === 'UNPAID' ? (
                    <button
                      className="bg-purple-600 text-white px-3 py-1 rounded"
                      onClick={() => approve(job.jobId)}
                    >
                      Approve Dispatch
                    </button>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {activeTab === 'employees' && <EmployeeManager />}
    </div>
  )
}
