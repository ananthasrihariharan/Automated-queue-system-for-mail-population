import React, { useState, useEffect } from 'react';
import './DesignerCCTV.css';

interface Job {
  _id?: string;
  jobId: string;
  customerName: string;
  emailSubject?: string;
  description?: string;
  type: string;
  elapsedTime?: string;
  pauseReason?: string;
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
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [selectedSession, setSelectedSession] = useState<StaffSession | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!Array.isArray(sessions)) return <div className="cctv-empty">Waiting for session data...</div>;

  if (isMobile) {
    return (
      <div className="mobile-cctv-container animate-fade-in">
        {/* Summary stats: logged in staffs */}
        <div className="mobile-cctv-summary" style={{ padding: '0.65rem 0.85rem', background: '#f1f5f9', borderRadius: '0.75rem', margin: '0 0.75rem 0.75rem', fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>👥 Logged In: <strong>{sessions.length}</strong></span>
          <span>🟢 Active: <strong>{sessions.filter(s => !!(s.currentQueueJob || s.currentWalkinJob)).length}</strong></span>
        </div>

        <div className="mobile-cctv-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', padding: '0 0.75rem 0.75rem' }}>
          {sessions.map(s => {
            const activeJob = s.currentQueueJob || s.currentWalkinJob;
            const paused = Array.isArray(s.pausedJobs) ? s.pausedJobs : [];
            const pinned = Array.isArray(s.pinnedJobs) ? s.pinnedJobs : [];
            return (
              <div
                key={s._id}
                className="mobile-cctv-card"
                onClick={() => setSelectedSession(s)}
                style={{
                  background: 'white',
                  borderRadius: '0.75rem',
                  padding: '0.75rem',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  cursor: 'pointer'
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', minWidth: 0 }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: activeJob ? '#10b981' : '#cbd5e1', flexShrink: 0 }} />
                    <span style={{ fontWeight: 850, fontSize: '0.82rem', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.staffName || 'Staff'}
                    </span>
                  </div>
                </div>

                {/* WIP */}
                <div style={{ flex: 1, minHeight: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <span style={{ fontSize: '0.62rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em' }}>CURRENT WORK</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 750, color: activeJob ? '#1e293b' : '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {activeJob ? (s.activeJobCustomer || activeJob.customerName || 'Processing') : 'Idle'}
                  </span>
                </div>

                {/* Counts */}
                <div style={{ display: 'flex', gap: '0.6rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.4rem', fontSize: '0.68rem', fontWeight: 800 }}>
                  <div style={{ color: '#ea580c' }}>HOLD: <strong>{paused.length}</strong></div>
                  <div style={{ color: '#2563eb' }}>QUEUE: <strong>{pinned.length}</strong></div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Session detail modal */}
        {selectedSession && (
          <div className="modal-overlay" onClick={() => setSelectedSession(null)} style={{ zIndex: 11000 }}>
            <div className="modal-content-luxury slide-in-bottom" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', width: '92vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', borderRadius: '0.75rem' }}>
              <div className="modal-header-premium">
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>{selectedSession.staffName} — Load Details</h2>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Active workload metrics and assignments</p>
                </div>
                <button className="close-btn-p" onClick={() => setSelectedSession(null)}>&times;</button>
              </div>

              <div className="modal-scroll-area" style={{ padding: '1.25rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* 1. Active workspace */}
                <div>
                  <h3 style={{ fontSize: '0.75rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.04em' }}>
                    🟢 Current Active Work
                  </h3>
                  {selectedSession.currentQueueJob || selectedSession.currentWalkinJob ? (
                    (() => {
                      const active = selectedSession.currentQueueJob || selectedSession.currentWalkinJob;
                      return (
                        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.75rem', borderRadius: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#065f46', display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedSession.activeJobCustomer || active?.customerName}</span>
                            <br />
                            <span style={{ fontSize: '0.68rem', color: '#047857', fontWeight: 650 }}>#{formatId(active?.jobId || active?._id)} • {active?.emailSubject || active?.description || 'Active job'}</span>
                          </div>
                          <span style={{ fontSize: '0.72rem', fontWeight: 850, color: '#047857', background: '#d1fae5', padding: '0.2rem 0.5rem', borderRadius: '0.35rem', marginLeft: '0.5rem', flexShrink: 0 }}>
                            {selectedSession.elapsedTime || '0m'}
                          </span>
                        </div>
                      );
                    })()
                  ) : (
                    <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '1rem', borderRadius: '0.75rem', textAlign: 'center', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>
                      No active job being processed.
                    </div>
                  )}
                </div>

                {/* 2. Paused / Hold workspace */}
                <div>
                  <h3 style={{ fontSize: '0.75rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.04em' }}>
                    ⚠️ Jobs On Hold ({selectedSession.pausedJobs?.length || 0})
                  </h3>
                  {selectedSession.pausedJobs && selectedSession.pausedJobs.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {selectedSession.pausedJobs.map((j: any) => (
                        <div key={j._id || j.jobId} style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '0.75rem', borderRadius: '0.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#92400e' }}>{j.customerName}</span>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '1px 5px', borderRadius: '4px' }}>
                              #{formatId(j.jobId || j._id)}
                            </span>
                          </div>
                          {j.pauseReason && (
                            <div style={{ fontSize: '0.7rem', color: '#b45309', fontWeight: 650, marginTop: '0.2rem' }}>
                              Reason: {j.pauseReason}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '1rem', borderRadius: '0.75rem', textAlign: 'center', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>
                      No held jobs in this workspace.
                    </div>
                  )}
                </div>

                {/* 3. Pinned Queue workspace */}
                <div>
                  <h3 style={{ fontSize: '0.75rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.04em' }}>
                    📥 Pinned / Reserved Queue ({selectedSession.pinnedJobs?.length || 0})
                  </h3>
                  {selectedSession.pinnedJobs && selectedSession.pinnedJobs.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {selectedSession.pinnedJobs.map((j: any) => (
                        <div key={j._id || j.jobId} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.75rem', borderRadius: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ minWidth: 0, flex: 1, paddingRight: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1e40af', display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.customerName}</span>
                            <br />
                            <span style={{ fontSize: '0.68rem', color: '#2563eb', fontWeight: 650, display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.emailSubject || j.description || 'Pinned job'}</span>
                          </div>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '2px 5px', borderRadius: '4px', flexShrink: 0 }}>
                            #{formatId(j.jobId || j._id)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '1rem', borderRadius: '0.75rem', textAlign: 'center', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>
                      No pinned queue jobs.
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer-luxury">
                <button className="btn-supreme-black" onClick={() => setSelectedSession(null)} style={{ width: '100%' }}>CLOSE DETAILS</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

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
