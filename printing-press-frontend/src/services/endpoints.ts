export const endpoints = {
  login: '/api/login',

  cashierJobs: '/api/cashier/jobs',
  markPaid: (jobId: string) =>
    `/api/cashier/jobs/${jobId}/payment`,

  dispatchJobs: '/api/dispatch/jobs',
  adminUnpaid: '/api/admin/jobs/unpaid'
}
