import React from 'react';
import './DesignerCCTV.css';

interface Job {
  jobId: string;
  customerName: string;
  emailSubject?: string;
  description?: string;
  type: string;
  elapsedTime?: string;
}

interface StaffSession {
  _id: string;
  staffId: {
    _id: string;
    name: string;
  };
  staffName: string;
  currentQueueJob?: Job;
  currentWalkinJob?: Job;
  pinnedJobs: Job[];
  pausedJobs: Job[];
  elapsedTime?: string;
  activeJobCustomer?: string;
}

interface DesignerCCTVProps {
  sessions: StaffSession[];
}

const formatId = (id: any) => {
  if (!id) return '???';
  const str = String(id);
  // If it's a long mongo ID, take the last 6
  return str.length > 8 ? str.substring(str.length - 6).toUpperCase() : str;
};

const DesignerCCTV: React.FC<DesignerCCTVProps> = ({ sessions }) => {
  if (!Array.isArray(sessions)) return <div className="cctv-empty">Waiting for session data...</div>;

  return (
    <div className="cctv-grid">
      {sessions.map((session) => {
        if (!session) return null;
        const activeJob = session.currentQueueJob || session.currentWalkinJob;
        const isBusy = !!activeJob;
        const staffName = session.staffName || 'Unknown';
        const pinned = Array.isArray(session.pinnedJobs) ? session.pinnedJobs : [];
        const paused = Array.isArray(session.pausedJobs) ? session.pausedJobs : [];

        return (
          <div key={session._id} className={`cctv-box ${isBusy ? 'busy' : 'idle'}`}>
            <div className="cctv-box-header">
              <div className="staff-info">
                <span className="status-indicator"></span>
                <span className="staff-name">{staffName}</span>
              </div>
              <div className="staff-meta">
                {isBusy ? 'ACTIVE' : 'IDLE'}
              </div>
            </div>

            <div className="cctv-box-body">
              {/* TOP: ACTIVE JOB */}
              <div className="active-section">
                <div className="section-label">IN PROGRESS</div>
                {activeJob ? (
                  <div className="active-job-card">
                    <div className="job-id">#{formatId((activeJob as any).jobId || (activeJob as any)._id)}</div>
                    <div className="job-customer">{session.activeJobCustomer || activeJob.customerName || 'In Progress'}</div>
                    <div className="job-timer">{session.elapsedTime || '0m'}</div>
                  </div>
                ) : (
                  <div className="empty-active">Awaiting next assignment...</div>
                )}
              </div>

              {/* BOTTOM: SPLIT COLUMNS */}
              <div className="split-section">
                <div className="hold-column">
                  <div className="section-label">ON HOLD ({paused.length})</div>
                  <div className="mini-list">
                    {paused.length > 0 ? (
                      paused.map(job => (
                        <div key={(job as any)._id || (job as any).jobId} className="mini-job-item hold">
                          <span className="id">#{formatId((job as any).jobId || (job as any)._id)}</span>
                          <span className="cus">{job.customerName}</span>
                        </div>
                      ))
                    ) : (
                      <div className="mini-empty">None</div>
                    )}
                  </div>
                </div>

                <div className="queue-column">
                  <div className="section-label">OWN QUEUE ({pinned.length})</div>
                  <div className="mini-list">
                    {pinned.length > 0 ? (
                      pinned.map(job => (
                        <div key={(job as any)._id || (job as any).jobId} className="mini-job-item queue">
                          <span className="id">#{formatId((job as any).jobId || (job as any)._id)}</span>
                          <span className="cus">{job.customerName}</span>
                        </div>
                      ))
                    ) : (
                      <div className="mini-empty">None</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DesignerCCTV;
