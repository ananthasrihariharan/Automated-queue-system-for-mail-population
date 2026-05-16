import { useState, useEffect, useMemo } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
  useIsFetching,
} from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { queueApi } from "../../services/queueApi";
import { useQueueSocket } from "../../hooks/useQueueSocket";
import UserMenu from "../../components/UserMenu";
import ModuleNavigation from "../../components/ModuleNavigation";
import { MessagingTray } from "../../shared/components/MessagingTray";
import LinkifiedText from "../../shared/components/LinkifiedText";
import { formatSubject } from "../../shared/utils/queueHelpers";
import "./AdminQueuePanel.css";
import "./AdminQueuePanelMobile.css";
import DesignerCCTV from "./DesignerCCTV";

interface AdminJobsResponse {
  jobs: any[];
  total: number;
  pages: number;
  stats: any;
}

const getLocalToday = () => new Date().toLocaleDateString("en-CA");
const BACKEND_URL = import.meta.env.PROD
  ? ""
  : import.meta.env.VITE_BACKEND_URL || "";

function renderAuditDetails(action: string, details: any) {
  if (action === "JOB_INGESTED") {
    return (
      <span>
        Source files received: <strong>{details.textFilesIngested || 0}</strong> docs,{" "}
        <strong>{details.attachmentsIngested || 0}</strong> attachments.
      </span>
    );
  }
  if (action === "CREATED") {
    return <span>Task successfully registered in the system.</span>;
  }
  if (action === "STATUS_CHANGE") {
    return (
      <span>
        Status updated from <strong>{details.oldStatus}</strong> to{" "}
        <strong>{details.newStatus}</strong>
      </span>
    );
  }
  if (action === "ASSIGNED" || action === "PINNED") {
    return (
      <span>
        Assigned to <strong>{details.staffName || details.newStaffName || "a designer"}</strong>
      </span>
    );
  }
  if (action === "UNPINNED" || action === "RETURNED_TO_POOL") {
    return <span>Job returned to general pool</span>;
  }
  if (action === "PRIORITY_CHANGE") {
    return (
      <span>
        Priority adjusted to <strong>{details.newPriority || details.newScore}</strong>
      </span>
    );
  }
  if (action === "NOTES_ADDED" || action === "REASSIGN_REQUEST") {
    return (
      <div className="audit-note-box">
        "{details.notes || details.reason || "No notes provided"}"
      </div>
    );
  }
  if (action === "WALKIN_CREATED" || action === "WALKIN_APPROVED") {
    return (
      <span>
        Customer <strong>Walk-in</strong> upload completed via QR Portal.
      </span>
    );
  }
  if (action === "COMPLETED") {
    return (
      <span>
        Job marked as <strong>COMPLETED</strong> by {details.staffName || "staff"}.
      </span>
    );
  }
  if (action === "PAUSED") {
    return (
      <span>
        Job put on <strong>HOLD</strong> by {details.staffName || "staff"}.
      </span>
    );
  }
  if (action === "RESUMED") {
    return (
      <span>
        Work <strong>RESUMED</strong> by {details.staffName || "staff"}.
      </span>
    );
  }
  return <span>Details updated.</span>;
}

export default function AdminQueuePanel() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isFetching = useIsFetching();
  const [activeTab, setActiveTab] = useState<
    "QUEUED" | "ASSIGNED" | "COMPLETED" | "ADMIN_REVIEW" | "JUNK" | "LOAD"
  >("QUEUED");
  const [page, setPage] = useState(1);

  // Search with debounce
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [assignedToFilter, setAssignedToFilter] = useState("");
  const [dateFilter, setDateFilter] = useState(getLocalToday());
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());

  // Modal states
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [selectedLogJob, setSelectedLogJob] = useState<any>(null);
  const [showJobAuditModal, setShowJobAuditModal] = useState<any>(null);
  const [showThreadHistoryModal, setShowThreadHistoryModal] = useState<
    string | null
  >(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const [showReassignModal, setShowReassignModal] = useState<any>(null);
  const [reassignTargetId, setReassignTargetId] = useState<string>("");
  const [reassignNotes, setReassignNotes] = useState<string>("");
  const [profile, setProfile] = useState<any>(null);
  const [showMessages, setShowMessages] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [chatSettings, setChatSettings] = useState<{
    recipient: string;
    jobId: string;
    prefill: string;
  }>({ recipient: "ALL", jobId: "", prefill: "" });

  // Telemetry Detail Modals
  const [showLiveLoadDetail, setShowLiveLoadDetail] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);

  // Row table settings
  const [showViewModal, setShowViewModal] = useState<any>(null);
  const [showRetrieveModal, setShowRetrieveModal] = useState<any>(null);
  const [showStaffWorkspace, setShowStaffWorkspace] = useState<any>(null);
  const [rowsPerPage, setRowsPerPage] = useState<number>(20);
  const [lineSpacing, setLineSpacing] = useState<
    "compact" | "normal" | "relaxed"
  >("normal");

  useEffect(() => {
    const user = localStorage.getItem("user");
    if (user) setProfile(JSON.parse(user));
  }, []);

  // Handle Search Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 1. Data Fetching
  const { data: queueData, isLoading: queueLoading } =
    useQuery<AdminJobsResponse>({
      queryKey: [
        "admin-queue-jobs",
        activeTab,
        page,
        debouncedSearch,
        assignedToFilter,
        dateFilter,
        rowsPerPage,
      ],
      queryFn: () => {
        let effectiveDate = undefined;
        if (activeTab === "COMPLETED") effectiveDate = dateFilter;
        return queueApi.getAdminJobs({
          status: activeTab,
          page,
          limit: rowsPerPage,
          search: debouncedSearch || undefined,
          assignedTo: assignedToFilter || undefined,
          date: effectiveDate,
        });
      },
      placeholderData: keepPreviousData,
      refetchInterval: 10000,
      enabled: activeTab !== "LOAD"
    });

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ["admin-queue-sessions"],
    queryFn: async () => {
      const data = await queueApi.getAdminSessions();
      // GHOST FILTER: Only ignore if the fields are MISSING entirely (Zombie behavior)
      // If the fields are present but empty ([]), it's a valid IDLE state.
      if (Array.isArray(data) && data.length > 0) {
        const isZombieResponse = !data.some(s => Object.prototype.hasOwnProperty.call(s, 'pinnedJobs'));
        if (isZombieResponse) {
          console.warn("[CCTV] Ignoring zombie response (fields missing)");
          throw new Error("Stale session data detected");
        }
      }
      return data;
    },
    refetchInterval: 5000,
    placeholderData: (previousData) => previousData,
    retry: 1,
  });

  const { data: staffList } = useQuery({
    queryKey: ["staff-list"],
    queryFn: queueApi.getStaffList,
  });

  const { data: configs } = useQuery({
    queryKey: ["system-config"],
    queryFn: queueApi.getSystemConfig,
  });

  const { data: stats } = useQuery({
    queryKey: ["queue-stats"],
    queryFn: queueApi.getQueueStats,
    refetchInterval: 30000,
  });

  const { data: leaderboardData } = useQuery({
    queryKey: ["staff-leaderboard"],
    queryFn: queueApi.getStaffLeaderboard,
    enabled: showLeaderboard,
    refetchInterval: showLeaderboard ? 30000 : false,
  });

  const updateConfigMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: any }) =>
      queueApi.updateSystemConfig(key, value),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["system-config"] }),
  });

  const { data: eventLogs } = useQuery({
    queryKey: ["admin-queue-logs"],
    queryFn: () => queueApi.getEventLog(100),
    enabled: showLogsModal,
    refetchInterval: showLogsModal ? 10000 : false,
  });

  const { data: threadHistory } = useQuery({
    queryKey: ["admin-thread-history", showThreadHistoryModal],
    queryFn: () => queueApi.getThreadHistory(showThreadHistoryModal!),
    enabled: !!showThreadHistoryModal,
  });

  // 2. Real-time Updates
  const { socket } = useQueueSocket("admin", profile?._id || profile?.id);

  useEffect(() => {
    if (!socket) return;

    const handleSync = (payload: any) => {
      queryClient.setQueryData(["admin-queue-sessions"], payload.sessions);
      queryClient.invalidateQueries({ queryKey: ["admin-queue-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["queue-stats"] });
    };
    const refreshReview = () => {
      queryClient.invalidateQueries({ queryKey: ["admin-queue-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["queue-stats"] });
    };
    const handleChatReceived = (msg: any) => {
      const myId = profile?._id || profile?.id;
      if (!showMessages && String(msg.sender).trim() !== String(myId).trim()) {
        setHasUnread(true);
      }
    };

    socket.on("state:sync", handleSync);
    socket.on("walkin:requested", refreshReview);
    socket.on("reassign:requested", refreshReview);
    socket.on("chat:received", handleChatReceived);

    return () => {
      socket.off("state:sync", handleSync);
      socket.off("walkin:requested", refreshReview);
      socket.off("reassign:requested", refreshReview);
      socket.off("chat:received", handleChatReceived);
    };
  }, [socket, queryClient, showMessages, profile?._id, profile?.id]);

  // 3. Mutations
  const updatePriorityMutation = useMutation({
    mutationFn: ({
      jobId,
      priorityScore,
    }: {
      jobId: string;
      priorityScore: number;
    }) => queueApi.updatePriority(jobId, { priorityScore }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-queue-jobs"] }),
  });

  const deleteJobMutation = useMutation({
    mutationFn: (jobId: string) => queueApi.deleteJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-queue-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["queue-stats"] });
    },
  });

  const restoreJobMutation = useMutation({
    mutationFn: (jobId: string) => queueApi.restoreJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-queue-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["queue-stats"] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (jobIds: string[]) => queueApi.bulkDeleteJobs(jobIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-queue-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["queue-stats"] });
      setSelectedJobs(new Set());
    },
  });

  const bulkRestoreMutation = useMutation({
    mutationFn: (jobIds: string[]) => queueApi.bulkRestoreJobs(jobIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-queue-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["queue-stats"] });
      setSelectedJobs(new Set());
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: ({ jobIds, status }: { jobIds: string[]; status: string }) =>
      queueApi.bulkUpdateStatus(jobIds, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-queue-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["queue-stats"] });
      setSelectedJobs(new Set());
    },
  });

  const handleBulkDelete = () => {
    if (selectedJobs.size === 0) return;
    if (
      window.confirm(
        `CAUTION: Are you sure you want to PERMANENTLY delete these ${selectedJobs.size} jobs?`,
      )
    ) {
      bulkDeleteMutation.mutate(Array.from(selectedJobs));
    }
  };

  const handleBulkRestore = () => {
    if (selectedJobs.size === 0) return;
    if (
      window.confirm(
        `Restore these ${selectedJobs.size} jobs to the waiting pool?`,
      )
    ) {
      bulkRestoreMutation.mutate(Array.from(selectedJobs));
    }
  };

  const toggleSelection = (jobId: string) => {
    const next = new Set(selectedJobs);
    if (next.has(jobId)) next.delete(jobId);
    else next.add(jobId);
    setSelectedJobs(next);
  };


  const handleDelete = (jobId: string) => {
    if (
      window.confirm(
        "CAUTION: Are you sure you want to PERMANENTLY delete this job? This action cannot be undone.",
      )
    ) {
      deleteJobMutation.mutate(jobId);
    }
  };

  const pinJobMutation = useMutation({
    mutationFn: ({ jobId, staffId }: { jobId: string; staffId: string }) =>
      queueApi.pinJob(jobId, staffId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-queue-jobs"] }),
  });

  const unpinJobMutation = useMutation({
    mutationFn: (jobId: string) => queueApi.unpinJob(jobId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-queue-jobs"] }),
  });

  const reorderQueueMutation = useMutation({
    mutationFn: ({
      jobId,
      queuePosition,
    }: {
      jobId: string;
      queuePosition: number;
    }) => queueApi.reorderQueue(jobId, { queuePosition }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-queue-jobs"] }),
  });

  const reassignJobMutation = useMutation({
    mutationFn: ({
      jobId,
      toStaffId,
      notes,
      forceMode,
      batchMode,
    }: {
      jobId: string;
      toStaffId: string | null;
      notes: string;
      forceMode?: "PUSH" | "PARK";
      batchMode?: boolean;
    }) =>
      queueApi.reassignJob(jobId, { toStaffId, notes, forceMode, batchMode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-queue-jobs"] });
      setShowReassignModal(null);
      setReassignTargetId("");
      setReassignNotes("");
    },
  });

  const retrieveJobMutation = useMutation({
    mutationFn: ({
      jobId,
      toStaffId,
    }: {
      jobId: string;
      toStaffId: string | null;
    }) => queueApi.retrieveJob(jobId, toStaffId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-queue-jobs"] });
      setShowRetrieveModal(null);
      setShowViewModal(null);
    },
  });

  const startSessionMutation = useMutation({
    mutationFn: queueApi.startSession,
  });

  const formatLogDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return {
      date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
  };

  const filteredLogs = Array.isArray(eventLogs)
    ? eventLogs.filter((log: any) => {
        const matchesSearch =
          !logSearch ||
          log.customerName.toLowerCase().includes(logSearch.toLowerCase()) ||
          log._id.toLowerCase().includes(logSearch.toLowerCase());
        return matchesSearch;
      })
    : [];

  const onlineStaffIds = new Set(
    (Array.isArray(sessions) ? sessions : []).map(
      (s: any) => s.staffId?._id || s.staffId,
    ),
  );
  const busyStaffIds = new Set(
    (Array.isArray(sessions) ? sessions : [])
      .filter((s: any) => s.currentQueueJob || s.currentWalkinJob)
      .map((s: any) => s.staffId?._id || s.staffId),
  );

  const assignmentStaffList = useMemo(() => {
    return (staffList || []).filter((s: any) => {
      const roles = s.roles || (s.role ? [s.role] : []);
      return roles.includes("ADMIN") || roles.includes("PREPRESS");
    });
  }, [staffList]);

  if (queueLoading || sessionsLoading)
    return (
      <div className="admin-queue-loading-screen">
        <div className="loading-content-hub">
          <div className="queue-loading-spinner" />
          <div className="loading-text-elite">Loading Queue...</div>
        </div>
      </div>
    );

  return (
    <div className="admin-queue-page">
      <div className={`global-loading-bar ${isFetching ? "active" : ""}`} />
      <header className="admin-queue-header">
        <div className="header-left-hub">
          <Link to="/admin" className="back-btn-luxury">
            <svg
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            BACK
          </Link>
          <div className="header-titles">
            <h1 className="admin-queue-title">QUEUE CONTROL CENTER</h1>
          </div>
        </div>

        <div className="header-right-hub">
          <Link 
            to="/admin/whatsapp-job" 
            className="whatsapp-btn-luxury"
            title="WhatsApp Manual Entry"
          >
            <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            UPLOAD
          </Link>
          <div className="vertical-divider" />
          <button 
            className={`btn-chat-toggle-elite ${hasUnread ? 'has-unread' : ''}`} 
            onClick={() => { setShowMessages(true); setHasUnread(false); }}
            title="Internal Messaging"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            {hasUnread && <span className="unread-pulse-dot" />}
          </button>
          <div className="vertical-divider" />
          <button 
            className="btn-chat-toggle-elite" 
            onClick={() => setShowSettingsModal(true)}
            title="System Settings"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
          <div className="vertical-divider" />
          <ModuleNavigation />
          <div className="vertical-divider" />
          <UserMenu />
        </div>
      </header>

      <MessagingTray
        isOpen={showMessages}
        onClose={() => {
          setShowMessages(false);
          setHasUnread(false);
          setChatSettings({ recipient: "all", jobId: "", prefill: "" });
        }}
        currentUser={{
          id: profile?._id || profile?.id || "",
          name: profile?.name || "Admin",
          role: "ADMIN",
        }}
        socket={socket}
        onlineStaff={sessions || []}
        allStaff={staffList || []}
        initialRecipient={chatSettings.recipient}
        initialJobId={chatSettings.jobId}
        prefilledMessage={chatSettings.prefill}
      />

      <div className="admin-main-grid">
        <div className="admin-queue-section">
          {/* Integrated Control Bar */}
          <div className="queue-controls-unified-bar">
            <div className="tabs-container-premium">
              <button
                className={`tab-btn-luxury ${activeTab === "QUEUED" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("QUEUED");
                  setPage(1);
                  setSelectedJobs(new Set());
                }}
              >
                Waiting
                {stats?.totalQueued > 0 && (
                  <span className="tab-badge-luxury bg-blue">
                    {stats.totalQueued}
                  </span>
                )}
              </button>
              <button
                className={`tab-btn-luxury ${activeTab === "ASSIGNED" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("ASSIGNED");
                  setPage(1);
                  setSelectedJobs(new Set());
                }}
              >
                In Progress
                {stats?.totalInProgress > 0 && (
                  <span className="tab-badge-luxury bg-green">
                    {stats.totalInProgress}
                  </span>
                )}
              </button>
              <button
                className={`tab-btn-luxury ${activeTab === "COMPLETED" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("COMPLETED");
                  setPage(1);
                  setSelectedJobs(new Set());
                }}
              >
                Finished
                {activeTab !== "COMPLETED" && stats?.completed > 0 && (
                  <span className="tab-badge-luxury bg-slate">
                    {stats.completed}
                  </span>
                )}
              </button>
              <button
                className={`tab-btn-luxury ${activeTab === "ADMIN_REVIEW" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("ADMIN_REVIEW");
                  setPage(1);
                  setSelectedJobs(new Set());
                }}
              >
                ⚠ Review
                {stats?.adminReview > 0 && (
                  <span className="tab-badge-luxury bg-red">
                    {stats.adminReview}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("JUNK")}
                className={`tab-btn-luxury ${activeTab === "JUNK" ? "active" : ""}`}
              >
                Junk
                <span className="tab-badge-luxury">{stats?.junk || 0}</span>
              </button>
              <button
                onClick={() => setActiveTab("LOAD")}
                className={`tab-btn-luxury ${activeTab === "LOAD" ? "active" : ""}`}
              >
                Staff Load
                <span className="tab-badge-luxury">{stats?.activeSessions || 0}</span>
              </button>
            </div>

            <div className="filters-group-hub">
              {activeTab !== "LOAD" && (
                <>
                  <div className="search-input-wrapper">
                    <svg
                      className="search-icon"
                      width="18"
                      height="18"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search tasks..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <button
                    className={`btn-selection-toggle ${isSelectionMode ? "active" : ""}`}
                    onClick={() => {
                      setIsSelectionMode(!isSelectionMode);
                      setSelectedJobs(new Set());
                    }}
                  >
                    {isSelectionMode ? (
                      <>
                        <svg
                          width="16"
                          height="16"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                        <span>CANCEL</span>
                      </>
                    ) : (
                      <>
                        <svg
                          width="16"
                          height="16"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                          />
                        </svg>
                        <span>SELECT</span>
                      </>
                    )}
                  </button>
                  {isSelectionMode && selectedJobs.size > 0 && (
                    <div className="aqt-selection-hub slide-in-top">
                      <div className="aqt-selection-count">
                        <strong>{selectedJobs.size}</strong>
                      </div>
                      <div className="aqt-selection-divider" />
                      <div className="aqt-selection-buttons">
                        {activeTab !== "JUNK" ? (
                          <button
                            className="aqt-sel-btn-premium junk"
                            onClick={() =>
                              bulkStatusMutation.mutate({
                                jobIds: Array.from(selectedJobs),
                                status: "JUNK",
                              })
                            }
                          >
                            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            JUNK
                          </button>
                        ) : (
                          <button
                            className="aqt-sel-btn-premium restore"
                            onClick={handleBulkRestore}
                          >
                            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            RESTORE
                          </button>
                        )}
                        
                        {activeTab !== "ADMIN_REVIEW" && (
                          <button
                            className="aqt-sel-btn-premium review"
                            onClick={() =>
                              bulkStatusMutation.mutate({
                                jobIds: Array.from(selectedJobs),
                                status: "ADMIN_REVIEW",
                              })
                            }
                          >
                            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                            </svg>
                            REVIEW
                          </button>
                        )}
                        
                        <button
                          className="aqt-sel-btn-premium delete"
                          onClick={handleBulkDelete}
                        >
                          <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          DELETE
                        </button>
                      </div>
                    </div>
                  )}

                  {!isSelectionMode && (
                    <div className="aqt-filters-static-row">
                      {activeTab === "COMPLETED" && (
                        <div className="filter-date-hub">
                          <input
                            type="date"
                            className="date-input-elite"
                            value={dateFilter}
                            onChange={(e) => {
                              setDateFilter(e.target.value);
                              setPage(1);
                            }}
                          />
                        </div>
                      )}
                      <div className="filter-select-hub">
                        <select
                          className="select-elite"
                          value={assignedToFilter}
                          onChange={(e) => {
                            setAssignedToFilter(e.target.value);
                            setPage(1);
                          }}
                        >
                          <option value="">All Designers</option>
                          {staffList?.map((s: any) => (
                            <option key={s._id} value={s._id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {activeTab === "LOAD" ? (
            <div className="aqt-table-wrapper" style={{ border: "none", boxShadow: "none", background: "transparent" }}>
              <DesignerCCTV sessions={sessions || []} />
            </div>
          ) : (
            <div className="aqt-table-wrapper">
              <table className={`aqt-table aqt-table-${activeTab.toLowerCase()}`}>
                <thead className="aqt-head">
                  <tr className="aqt-head-row">
                    <th className="aqt-th th-num">
                      <input
                        type="checkbox"
                        checked={
                          selectedJobs.size > 0 &&
                          (queueData?.jobs?.length ?? 0) > 0 &&
                          queueData?.jobs?.every((j: any) => selectedJobs.has(j._id))
                        }
                        onChange={() => {
                          if (queueData?.jobs?.every((j: any) => selectedJobs.has(j._id))) {
                            const next = new Set(selectedJobs);
                            queueData?.jobs?.forEach((j: any) => next.delete(j._id));
                            setSelectedJobs(next);
                            if (next.size === 0) setIsSelectionMode(false);
                          } else {
                            const next = new Set(selectedJobs);
                            queueData?.jobs?.forEach((j: any) => next.add(j._id));
                            setSelectedJobs(next);
                            setIsSelectionMode(true);
                          }
                        }}
                        style={{ width: "1.25rem", height: "1.25rem", cursor: "pointer" }}
                      />
                    </th>
                    <th className="aqt-th th-customer">CUSTOMER & FLAGS</th>
                    <th className="aqt-th th-time">TIMING</th>
                    <th className="aqt-th th-assign">ASSIGNMENT</th>
                    <th className="aqt-th th-priority">PRIORITY</th>
                    <th className="aqt-th th-order">PROGRESS</th>
                    <th className="aqt-th th-actions">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="aqt-body">
                  {queueData?.jobs?.map((job: any, index: number) => {
                    const { clean: subjectClean } = formatSubject(
                      job.emailSubject || "",
                    );
                    const priorityClass =
                      job.priorityScore >= 20
                        ? "priority-immediate"
                        : job.priorityScore >= 10
                          ? "priority-high"
                          : job.priorityScore >= 5
                            ? "priority-medium"
                            : "priority-low";
                    return (
                      <tr
                        key={job._id}
                        className={`aqt-row ${lineSpacing} ${priorityClass} ${selectedJobs.has(job._id) ? "aqt-row-selected" : ""}`}
                        onClick={() => {
                          if (isSelectionMode) toggleSelection(job._id);
                          else setShowViewModal(job);
                        }}
                      >
                        <td
                          className="aqt-cell tc-num"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedJobs.has(job._id)}
                            onChange={() => {
                              const next = new Set(selectedJobs);
                              if (next.has(job._id)) {
                                next.delete(job._id);
                                if (next.size === 0) setIsSelectionMode(false);
                              } else {
                                next.add(job._id);
                                setIsSelectionMode(true);
                              }
                              setSelectedJobs(next);
                            }}
                            style={{
                              width: "1.25rem",
                              height: "1.25rem",
                              cursor: "pointer",
                              accentColor: "var(--q-primary)",
                            }}
                          />
                        </td>

                        <td className="aqt-cell tc-customer">
                          <div className="aqt-customer-row-top">
                            <span className="aqt-customer-name" title={job.customerName}>
                              {job.customerName}
                            </span>
                            {job.type === "WHATSAPP" && (
                              <span className="aqt-source-badge wa">
                                📱 WA
                              </span>
                            )}
                            {(job.type === "WALKIN" || job.emailSubject?.includes("Walk-in")) && (
                              <span className="aqt-source-badge walkin">
                                🚶 WALK-IN
                              </span>
                            )}
                            <div className="aqt-flags-inline">
                              {job.threadId && (
                                <span
                                  className="aqt-flag-badge revision clickable"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowThreadHistoryModal(job.threadId);
                                  }}
                                  title="Click to view revision history"
                                >
                                  ↺ REV
                                </span>
                              )}
                              {job.lastPausedBy && job.status === "QUEUED" && (
                                <span
                                  className="aqt-flag-badge prior"
                                  title={`Prior work: ${job.lastPausedBy.name}`}
                                >
                                  PRIOR
                                </span>
                              )}
                              {job.status === "PAUSED" && (
                                <span
                                  className="aqt-flag-badge paused"
                                  title={`Paused by ${job.lastPausedBy?.name || 'unknown'}`}
                                >
                                  ⏸ HOLD
                                </span>
                              )}
                              {job.status === "IN_PROGRESS" && (
                                <span className="aqt-flag-badge active">
                                  ▶ ACTIVE
                                </span>
                              )}
                              {job.pinnedToStaff && job.status === "QUEUED" && (
                                <span
                                  className="aqt-flag-badge pinned"
                                  title={`Pinned to ${job.pinnedToStaff.name}`}
                                >
                                  📌 {job.pinnedToStaff.name.split(" ")[0]}
                                </span>
                              )}
                              {job.reassignedFrom &&
                                job.status === "ADMIN_REVIEW" && (
                                  <span
                                    className="aqt-flag-badge reassign-req"
                                    title={`Requested by ${job.reassignedFrom.name}`}
                                  >
                                    ⤨ REASSIGN
                                  </span>
                                )}
                            </div>
                          </div>
                          {(subjectClean || job.emailSubject) && (
                            <div className="aqt-subject-line">
                              {subjectClean || job.emailSubject}
                            </div>
                          )}

                          {job.status === "COMPLETED" && job.complexityTag && (
                            <div className="aqt-complexity-row">
                              <span className={`badge-complexity ${job.complexityTag.toLowerCase()}`}>
                                {job.complexityTag}
                              </span>
                            </div>
                          )}
                          {job.reassignedFrom &&
                            job.status === "ADMIN_REVIEW" &&
                            job.reassignedFrom.name && (
                              <div className="aqt-reassign-container">
                                <div className="aqt-designer-chip reassign">
                                  <span className="aqt-chip-av orange">
                                    {job.reassignedFrom.name.charAt(0)}
                                  </span>
                                  <span>From {job.reassignedFrom.name}</span>
                                </div>
                                {job.reassignReason && (
                                  <div className="aqt-reassign-reason-bright">
                                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <span>Reason: {job.reassignReason}</span>
                                  </div>
                                )}
                                {job.adminNotes && (
                                  <div className="aqt-admin-notes-mini">
                                    <strong>Admin Note:</strong> {job.adminNotes}
                                  </div>
                                )}
                              </div>
                            )}
                        </td>

                        <td className="aqt-cell tc-time">
                          <div className="aqt-time-pill">
                            <span className={`time-badge ${activeTab === "COMPLETED" ? "done" : "recv"}`}>
                              {activeTab === "COMPLETED" ? "DONE" : "RECV"}
                            </span>
                            <div className="time-stack">
                              <div className="aqt-subject-time">
                                {new Date(activeTab === "COMPLETED" ? (job.completedAt || job.updatedAt) : job.createdAt).toLocaleDateString([], {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </div>
                              <div className="aqt-time-sub">
                                {new Date(activeTab === "COMPLETED" ? (job.completedAt || job.updatedAt) : job.createdAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td
                          className="aqt-cell tc-assign"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {activeTab === "QUEUED" ||
                          activeTab === "ADMIN_REVIEW" ? (
                            <select
                              className="aqt-inline-select"
                              value={
                                job.pinnedToStaff?._id ||
                                (activeTab === "ADMIN_REVIEW" ? "review" : "none")
                              }
                              onChange={(e) => {
                                const staffId = e.target.value;
                                if (
                                  activeTab === "ADMIN_REVIEW" &&
                                  (staffId === "pool" || staffId === "none")
                                ) {
                                  restoreJobMutation.mutate(job._id);
                                } else if (staffId === "none") {
                                  unpinJobMutation.mutate(job._id);
                                } else if (staffId !== "review") {
                                  if (
                                    !onlineStaffIds.has(staffId) &&
                                    !window.confirm(
                                      "Designer is OFFLINE. Pin anyway?",
                                    )
                                  )
                                    return;
                                  pinJobMutation.mutate({
                                    jobId: job._id,
                                    staffId,
                                  });
                                }
                              }}
                            >
                              <option value="none">— Pool —</option>
                              {activeTab === "ADMIN_REVIEW" && (
                                <>
                                  <option value="review">Review</option>
                                  <option value="pool">Pool</option>
                                </>
                              )}
                              {assignmentStaffList.map((s: any) => {
                                const sess = (Array.isArray(sessions) ? sessions : []).find((se: any) => (se.staffId?._id || se.staffId) === s._id);
                                const loadInfo = sess ? ` (H:${sess.pausedJobs?.length || 0} Q:${sess.pinnedJobs?.length || 0})` : "";
                                return (
                                  <option key={s._id} value={s._id}>
                                    {onlineStaffIds.has(s._id) ? "🟢" : "⚪"}{" "}
                                    {s.name}{" "}
                                    {loadInfo}{" "}
                                    {!onlineStaffIds.has(s._id)
                                      ? "(OFF)"
                                      : busyStaffIds.has(s._id)
                                        ? "(BUSY)"
                                        : "(READY)"}
                                  </option>
                                );
                              })}
                            </select>
                          ) : (
                            <div className="aqt-designer-chip mini">
                              <span
                                className={`aqt-chip-av ${activeTab === "COMPLETED" ? "green" : "blue"}`}
                              >
                                {job.assignedTo?.name?.charAt(0) || "?"}
                              </span>
                              <span>
                                {job.assignedTo?.name || "Unassigned"}
                                {(() => {
                                  const sess = (Array.isArray(sessions) ? sessions : []).find((se: any) => (se.staffId?._id || se.staffId) === job.assignedTo?._id);
                                  return sess ? (
                                    <small style={{ marginLeft: "0.4rem", color: "#64748b", fontWeight: 600 }}>
                                      (H:{sess.pausedJobs?.length || 0} Q:{sess.pinnedJobs?.length || 0})
                                    </small>
                                  ) : null;
                                })()}
                              </span>
                            </div>
                          )}
                        </td>

                        <td
                          className="aqt-cell tc-priority"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {activeTab === "QUEUED" ? (
                            <select
                              className={`aqt-inline-select priority-select p-${job.priorityScore >= 20 ? "imm" : job.priorityScore >= 10 ? "crit" : job.priorityScore >= 5 ? "urg" : "norm"}`}
                              value={job.priorityScore}
                              onChange={(e) =>
                                updatePriorityMutation.mutate({
                                  jobId: job._id,
                                  priorityScore: Number(e.target.value),
                                })
                              }
                            >
                              <option value="0">NORMAL</option>
                              <option value="5">URGENT</option>
                              <option value="10">CRITICAL</option>
                              <option value="20">IMMEDIATE</option>
                            </select>
                          ) : (
                            <span
                              className={`aqt-flag-badge p-level-${job.priorityScore >= 20 ? "imm" : "std"}`}
                            >
                              {job.priorityScore >= 20 ? "PRIORITY" : "STANDARD"}
                            </span>
                          )}
                        </td>

                        <td
                          className="aqt-cell tc-order"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {activeTab === "QUEUED" ? (
                            <div className="aqt-order-btns">
                              <button
                                className="aqt-order-btn"
                                disabled={
                                  index === 0 || reorderQueueMutation.isPending
                                }
                                onClick={() =>
                                  reorderQueueMutation.mutate({
                                    jobId: job._id,
                                    queuePosition: index - 1,
                                  })
                                }
                                title="Move up"
                              >
                                ↑
                              </button>
                              <button
                                className="aqt-order-btn"
                                disabled={
                                  index === (queueData?.jobs?.length || 1) - 1 ||
                                  reorderQueueMutation.isPending
                                }
                                onClick={() =>
                                  reorderQueueMutation.mutate({
                                    jobId: job._id,
                                    queuePosition: index + 1,
                                  })
                                }
                                title="Move down"
                              >
                                ↓
                              </button>
                            </div>
                          ) : (
                            <span className={`aqt-status-pill ${job.status}`}>
                              {job.status}
                            </span>
                          )}
                        </td>

                        <td
                          className="aqt-cell tc-actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="aqt-actions-group">
                            {activeTab === "JUNK" && (
                              <button
                                className="aqt-act-btn restore"
                                onClick={() => restoreJobMutation.mutate(job._id)}
                                title="Restore to pool"
                              >
                                ↩
                              </button>
                            )}
                            {job.assignedTo && (
                              <button
                                className="aqt-act-btn msg"
                                onClick={() => {
                                  setChatSettings({
                                    recipient: job.assignedTo._id,
                                    jobId: job._id,
                                    prefill: `Re Job #${job._id.substring(18).toUpperCase()}: `,
                                  });
                                  setShowMessages(true);
                                }}
                                title={`Message ${job.assignedTo.name}`}
                              >
                                <svg
                                  width="13"
                                  height="13"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                                  />
                                </svg>
                              </button>
                            )}
                            {activeTab === "ASSIGNED" &&
                              job.assignedTo && (
                                <button
                                  className="aqt-act-btn reassign"
                                  onClick={() => setShowReassignModal(job)}
                                  title="Force Reassign"
                                >
                                  <svg
                                    width="13"
                                    height="13"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                                    />
                                  </svg>
                                </button>
                              )}
                            <button
                              className="aqt-act-btn delete"
                              onClick={() => handleDelete(job._id)}
                              title="Delete permanently"
                            >
                              <svg
                                width="13"
                                height="13"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                            <button
                              className="aqt-act-btn audit"
                              onClick={() => setShowJobAuditModal(job)}
                              title="View Audit Log"
                            >
                              <svg
                                width="13"
                                height="13"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {(!queueData?.jobs || queueData.jobs.length === 0) && (
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          textAlign: "center",
                          padding: "3rem",
                          color: "#94a3b8",
                          fontSize: "0.875rem",
                        }}
                      >
                        No jobs in this queue.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab !== "LOAD" && (
            <div className="admin-queue-footer">
              <div className="pagination-controls-hub">
                <div className="pagination-info">
                  Page {page} of {queueData?.pages || 1} • {queueData?.total || 0}{" "}
                  total
                </div>
                <div className="pagination-buttons">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn-page-luxury"
                  >
                    ← PREV
                  </button>
                  <button
                    onClick={() =>
                      setPage((p) => Math.min(queueData?.pages || 1, p + 1))
                    }
                    disabled={page >= (queueData?.pages || 1)}
                    className="btn-page-luxury"
                  >
                    NEXT →
                  </button>
                </div>
              </div>

              <div className="footer-density-controls">
                <div className="density-row">
                  <span className="density-label">Rows per page:</span>
                  <select
                    className="density-select"
                    value={rowsPerPage}
                    onChange={(e) => {
                      setRowsPerPage(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
                <div className="vertical-divider-mini" />
                <div className="density-row">
                  <span className="density-label">Row Space</span>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="1"
                    className="density-slider-elite"
                    value={
                      lineSpacing === "compact"
                        ? 0
                        : lineSpacing === "normal"
                          ? 1
                          : 2
                    }
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setLineSpacing(
                        val === 0
                          ? "compact"
                          : val === 1
                            ? "normal"
                            : "relaxed",
                      );
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="sessions-sidebar-deck">
          {/* Vertical Stats Boxes */}
          <div className="sidebar-stats-grid">
            <div
              className="stat-box-vertical blue"
              onClick={() => setActiveTab("QUEUED")}
            >
              <span className="stat-box-label">Waiting</span>
              <span className="stat-box-num">{stats?.totalQueued || 0}</span>
              <span className="stat-box-unit">Tasks</span>
            </div>
            <div
              className="stat-box-vertical green"
              onClick={() => setShowLiveLoadDetail(true)}
            >
              <span className="stat-box-label">Live Load</span>
              <span className="stat-box-num">
                {stats?.totalInProgress || 0}
              </span>
              <span className="stat-box-unit">Active</span>
            </div>
            <div
              className="stat-box-vertical purple"
              onClick={() => setActiveTab("LOAD")}
            >
              <span className="stat-box-label">Designers</span>
              <span className="stat-box-num">{stats?.activeSessions || 0}</span>
              <span className="stat-box-unit">
                {
                  (Array.isArray(sessions) ? sessions : []).filter(
                    (s: any) => s.currentQueueJob || s.currentWalkinJob,
                  ).length
                }
                /{stats?.activeSessions || 0}
              </span>
            </div>
            <div
              className="stat-box-vertical gold"
              onClick={() => setShowLeaderboard(true)}
            >
              <span className="stat-box-label">Total Completed</span>
              <span className="stat-box-num">{stats?.completed || 0}</span>
              <span className="stat-box-unit">Jobs</span>
            </div>
          </div>

          <div className="sidebar-group">
            <h2 className="sidebar-title-luxury">
              <span className="status-dot green"></span>
              ONLINE DESIGNERS
            </h2>
            <div className="sidebar-scroll-height">
              {sessionsLoading ? (
                <div className="sidebar-loader">Syncing...</div>
              ) : (
                (Array.isArray(sessions) ? sessions : []).map(
                  (session: any) => (
                    <div key={session._id} className="designer-card-detailed" onClick={() => setShowStaffWorkspace(session.staffId)}>
                      <div className="designer-main-info">
                        <div className="designer-av-hub">
                          <div className="designer-avatar">
                            {session.staffName
                              ? session.staffName.charAt(0)
                              : "?"}
                          </div>
                          <span
                            className={`status-pill ${session.currentQueueJob || session.currentWalkinJob ? "busy" : "idle"}`}
                          >
                            {session.currentQueueJob || session.currentWalkinJob
                              ? "Occupied"
                              : "Ready"}
                          </span>
                        </div>
                        <div className="designer-text">
                          <div className="designer-name-row">
                            <span className="designer-name-elite" title={session.staffName || session.staffId?.name || "Unknown Staff"}>
                              {session.staffName || session.staffId?.name || "Unknown Staff"}
                            </span>
                            {session.paused && (
                              <span className="paused-indicator-marker">
                                • PAUSED
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {(session.currentQueueJob ||
                        session.currentWalkinJob ||
                        (session.pausedJobs?.length || 0) > 0 ||
                        (session.pinnedJobs?.length || 0) > 0) && (
                        <div className="designer-job-box">
                          {(session.currentQueueJob ||
                            session.currentWalkinJob) ? (
                            <>
                              <div className="job-box-title">
                                Working on:{" "}
                                <strong>
                                  {session.currentQueueJob?.customerName ||
                                    session.currentWalkinJob?.customerName ||
                                    "Active Job"}
                                </strong>
                              </div>
                              <div className="job-box-row">
                                <span className="job-label">Start Time:</span>
                                <span className="job-value">
                                  {session.startTime
                                    ? new Date(
                                        session.startTime,
                                      ).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })
                                    : "N/A"}
                                </span>
                              </div>
                              <div className="job-box-row">
                                <span className="job-label">Elapsed:</span>
                                <span className="job-value highlight">
                                  {session.elapsedTime || "0m"}
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="job-box-title" style={{ color: "#64748b", fontStyle: "italic", marginBottom: "0.5rem" }}>
                              Currently awaiting assignment...
                            </div>
                          )}
                            <div className="job-box-row" style={{ 
                              marginTop: "0.4rem", 
                              paddingTop: "0.4rem", 
                              borderTop: "1px dashed #e2e8f0", 
                              flexDirection: "column", 
                              alignItems: "flex-start",
                              width: "100%"
                            }}>
                              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", marginBottom: "0.4rem" }}>
                                <span className="job-label">Pending Load:</span>
                                <div style={{ 
                                  display: "flex", 
                                  gap: "6px", 
                                  background: "#f8fafc", 
                                  padding: "2px 8px", 
                                  borderRadius: "4px",
                                  border: "1px solid #e2e8f0"
                                }}>
                                  <span style={{ color: "#f59e0b", fontWeight: 700, fontSize: "0.7rem" }}>H:{session.pausedJobs?.length || 0}</span>
                                  <span style={{ color: "#cbd5e1" }}>|</span>
                                  <span style={{ color: "#3b82f6", fontWeight: 700, fontSize: "0.7rem" }}>Q:{session.pinnedJobs?.length || 0}</span>
                                </div>
                              </div>
                              
                              <div style={{ 
                                maxHeight: "60px", 
                                overflowY: "auto", 
                                width: "100%",
                                paddingRight: "4px",
                                scrollbarWidth: "thin"
                              }}>
                                {session.pausedJobs?.length > 0 && (
                                  <div style={{ fontSize: "0.65rem", color: "#64748b", marginBottom: "0.2rem" }}>
                                    <strong style={{ color: "#f59e0b" }}>Held:</strong> {session.pausedJobs.map((j: any) => j.customerName).join(", ")}
                                  </div>
                                )}
                                {session.pinnedJobs?.length > 0 && (
                                  <div style={{ fontSize: "0.65rem", color: "#64748b" }}>
                                    <strong style={{ color: "#3b82f6" }}>Queue:</strong> {session.pinnedJobs.map((j: any) => j.customerName).join(", ")}
                                  </div>
                                )}
                              </div>
                            </div>
                        </div>
                      )}
                    </div>
                  )
                )
              )}
            </div>
          </div>
        </aside>
      </div>

      <button 
        className="mobile-stats-fab" 
        onClick={() => setShowStatsModal(true)}
        title="View Queue Stats"
      >
        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </button>

      {showStatsModal && (
        <div className="modal-overlay" onClick={() => setShowStatsModal(false)}>
          <div className="modal-content-luxury" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="modal-header-premium">
              <h2>Queue Statistics</h2>
              <button className="close-btn-p" onClick={() => setShowStatsModal(false)}>&times;</button>
            </div>
            <div className="modal-scroll-area" style={{ padding: "1.5rem" }}>
               <div className="sidebar-stats-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div className="stat-box-vertical blue" onClick={() => { setActiveTab("QUEUED"); setShowStatsModal(false); }}>
                    <span className="stat-box-label">Waiting</span>
                    <span className="stat-box-num">{stats?.totalQueued || 0}</span>
                  </div>
                  <div className="stat-box-vertical green" onClick={() => { setShowLiveLoadDetail(true); setShowStatsModal(false); }}>
                    <span className="stat-box-label">Live Load</span>
                    <span className="stat-box-num">{stats?.totalInProgress || 0}</span>
                  </div>
                  <div className="stat-box-vertical purple" onClick={() => { setActiveTab("LOAD"); setShowStatsModal(false); }}>
                    <span className="stat-box-label">Designers</span>
                    <span className="stat-box-num">{stats?.activeSessions || 0}</span>
                  </div>
                  <div className="stat-box-vertical gold" onClick={() => { setShowLeaderboard(true); setShowStatsModal(false); }}>
                    <span className="stat-box-label">Completed</span>
                    <span className="stat-box-num">{stats?.completed || 0}</span>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {showStaffWorkspace && (
        <StaffInsightModal 
          staff={showStaffWorkspace} 
          onClose={() => setShowStaffWorkspace(null)} 
        />
      )}
      {showLogsModal && (
        <div className="modal-overlay" onClick={() => setShowLogsModal(false)}>
          <div className="logs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-premium">
              <div>
                <h2>Activity Journal</h2>
                <p>Audit trail of all job state transitions.</p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  placeholder="Filter..."
                  className="modal-filter-input"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                />
                <button
                  className="close-btn-p"
                  onClick={() => setShowLogsModal(false)}
                >
                  &times;
                </button>
              </div>
            </div>

            <div className="modal-scroll-area">
              <table className="activity-log-table">
                <thead>
                  <tr>
                    <th>Job / Customer</th>
                    <th>Event</th>
                    <th>Staff</th>
                    <th>Timestamp</th>
                    <th>Info</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs?.map((log: any) => {
                    const dt = formatLogDate(log.updatedAt);
                    return (
                      <tr key={log._id}>
                        <td>
                          <strong>{log.customerName}</strong>
                          <br />
                          <small>{(log.jobId || log._id).substring(18)}</small>
                        </td>
                        <td>
                          <span
                            className={`log-status-badge ${log.status.toLowerCase()}`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td>{log.assignedTo?.name || "—"}</td>
                        <td>
                          <span className="log-date">{dt.date}</span>{" "}
                          <span className="log-time">{dt.time}</span>
                        </td>
                        <td>
                          <button
                            className="btn-log-detail"
                            onClick={() => setSelectedLogJob(log)}
                          >
                            &gt;
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showJobAuditModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowJobAuditModal(null)}
        >
          <div
            className="logs-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "600px" }}
          >
            <div className="modal-header-premium">
              <h2>Audit: {showJobAuditModal.customerName}</h2>
              <button
                className="close-btn-p"
                onClick={() => setShowJobAuditModal(null)}
              >
                &times;
              </button>
            </div>
            <div className="modal-scroll-area" style={{ padding: "2rem" }}>
              <div className="audit-timeline">
                {showJobAuditModal.auditLog?.map((log: any, i: number) => (
                  <div
                    key={i}
                    style={{
                      paddingLeft: "1.5rem",
                      borderLeft: "2px solid #e2e8f0",
                      position: "relative",
                      marginBottom: "1.5rem",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: "-6px",
                        top: "0",
                        width: "10px",
                        height: "10px",
                        background: "#2563eb",
                        borderRadius: "50%",
                      }}
                    ></div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#94a3b8",
                        fontWeight: 700,
                      }}
                    >
                      {new Date(log.timestamp).toLocaleString()}
                    </div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 800 }}>
                      {log.action}
                      {log.actor?.name && (
                        <span
                          style={{
                            marginLeft: "0.5rem",
                            fontSize: "0.75rem",
                            color: "#64748b",
                            fontWeight: 500,
                          }}
                        >
                          — by {log.actor.name}
                        </span>
                      )}
                    </div>
                    {log.details && (
                      <div className="audit-details-lite">
                        {renderAuditDetails(log.action, log.details)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {selectedLogJob && (
        <div className="modal-overlay" onClick={() => setSelectedLogJob(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Log Entry Detail</h3>
            <div className="detail-row">
              <span>Log ID:</span> <strong>{selectedLogJob._id}</strong>
            </div>
            <div className="detail-row">
              <span>Customer:</span>{" "}
              <strong>{selectedLogJob.customerName}</strong>
            </div>
            <div className="detail-row">
              <span>Result:</span> <strong>{selectedLogJob.status}</strong>
            </div>
            {selectedLogJob.returnReason && (
              <div className="detail-row" style={{ color: "#ef4444" }}>
                <span>Note:</span>{" "}
                <strong>{selectedLogJob.returnReason}</strong>
              </div>
            )}
            <div className="modal-actions" style={{ marginTop: "2rem" }}>
              <button
                className="btn-complete"
                onClick={() => setSelectedLogJob(null)}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {viewImage && (
        <div className="lightbox-modal" onClick={() => setViewImage(null)}>
          <img
            src={viewImage || undefined}
            className="lightbox-img"
            alt="Enlarged"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="lightbox-close-btn"
            onClick={() => setViewImage(null)}
          >
            &times;
          </button>
        </div>
      )}

      {showThreadHistoryModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowThreadHistoryModal(null)}
        >
          <div
            className="modal glass-modal slide-in-bottom"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "600px" }}
          >
            <div className="modal-header-premium">
              <h3>Project Thread Timeline</h3>
              <button
                className="close-btn"
                onClick={() => setShowThreadHistoryModal(null)}
              >
                ×
              </button>
            </div>
            <div className="thread-timeline">
              {threadHistory?.map((entry: any, idx: number) => (
                <div key={entry._id} className="timeline-entry">
                  <div className="timeline-marker"></div>
                  <div className="timeline-content">
                    <div className="timeline-meta">
                      <span className="timeline-date">
                        {new Date(entry.createdAt).toLocaleDateString()}
                      </span>
                      <span className={`status-pill ${entry.status}`}>
                        {entry.status}
                      </span>
                    </div>
                    <h4 className="timeline-version">Version {idx + 1}</h4>
                    <p className="timeline-notes">
                      {entry.mailBody?.substring(0, 100)}...
                    </p>
                    {entry.assignedTo && (
                      <div className="timeline-staff">
                        <div className="staff-dot"></div>
                        <span>Handled by {entry.assignedTo.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              className="btn-q-core btn-q-primary"
              style={{ width: "100%", marginTop: "1.5rem" }}
              onClick={() => setShowThreadHistoryModal(null)}
            >
              CLOSE TIMELINE
            </button>
          </div>
        </div>
      )}

      {showLiveLoadDetail && (
        <div
          className="modal-overlay"
          onClick={() => setShowLiveLoadDetail(false)}
        >
          <div
            className="modal-content-luxury"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "700px" }}
          >
            <div className="modal-header-premium">
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "1.25rem",
                    fontWeight: 800,
                    color: "#0f172a",
                  }}
                >
                  Live Workload Detail
                </h2>
                <p
                  style={{
                    margin: "0.25rem 0 0 0",
                    fontSize: "0.85rem",
                    color: "#64748b",
                  }}
                >
                  Current active jobs being processed
                </p>
              </div>
              <button
                className="close-btn-p"
                onClick={() => setShowLiveLoadDetail(false)}
              >
                &times;
              </button>
            </div>

            <div
              className="modal-scroll-area"
              style={{ padding: "1.5rem", maxHeight: "60vh" }}
            >
              {(Array.isArray(sessions) ? sessions : []).filter(
                (s: any) => s.currentQueueJob || s.currentWalkinJob,
              ).length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "3rem",
                    color: "#94a3b8",
                  }}
                >
                  No jobs are currently being processed.
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  {(Array.isArray(sessions) ? sessions : [])
                    .filter((s: any) => s.currentQueueJob || s.currentWalkinJob)
                    .map((s: any) => (
                      <div
                        key={s.staffId?._id || s._id}
                        className="aqt-telemetry-row busy"
                      >
                        <div className="tel-staff">
                          <span
                            className={`av ${s.currentWalkinJob ? "orange" : "blue"}`}
                          >
                            {s.staffId?.name?.charAt(0) || "?"}
                          </span>
                          <span className="name">
                            {s.staffId?.name || "Unknown"}
                          </span>
                        </div>
                        <div className="tel-arrow">→</div>
                        <div className="tel-job">
                          <span className="cus">
                            {s.currentQueueJob?.customerName ||
                              s.currentWalkinJob?.customerName ||
                              "Customer"}
                          </span>
                          <span className="sub">
                            {s.currentQueueJob?.emailSubject ||
                              s.currentWalkinJob?.description ||
                              "Active Assignment"}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {showLeaderboard && (
        <div
          className="modal-overlay"
          onClick={() => setShowLeaderboard(false)}
        >
          <div
            className="logs-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "540px" }}
          >
            <div className="modal-header-premium">
              <div>
                <h2>🏆 Today's Leaderboard</h2>
                <p>Jobs completed by each designer today</p>
              </div>
              <button
                className="close-btn-p"
                onClick={() => setShowLeaderboard(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-scroll-area" style={{ padding: "1.5rem" }}>
              {!leaderboardData || leaderboardData.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "3rem",
                    color: "#94a3b8",
                    fontSize: "0.9rem",
                  }}
                >
                  No completed jobs yet today.
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  {leaderboardData.map((entry: any, idx: number) => {
                    const medal =
                      idx === 0
                        ? "🥇"
                        : idx === 1
                          ? "🥈"
                          : idx === 2
                            ? "🥉"
                            : `#${idx + 1}`;
                    const avgMins = entry.avgDurationMs
                      ? Math.round(entry.avgDurationMs / 60000)
                      : null;
                    const isTop = idx < 3;
                    return (
                      <div
                        key={entry.staffId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "1rem",
                          background: isTop
                            ? idx === 0
                              ? "linear-gradient(135deg,#fffbeb,#fef3c7)"
                              : idx === 1
                                ? "linear-gradient(135deg,#f8fafc,#f1f5f9)"
                                : "linear-gradient(135deg,#fff7ed,#ffedd5)"
                            : "#f8fafc",
                          border: `1px solid ${idx === 0 ? "#fde68a" : idx === 1 ? "#e2e8f0" : idx === 2 ? "#fed7aa" : "#f1f5f9"}`,
                          borderRadius: "1rem",
                          padding: "1rem 1.25rem",
                          boxShadow: isTop
                            ? "0 4px 12px rgba(0,0,0,0.06)"
                            : "none",
                        }}
                      >
                        <span
                          style={{
                            fontSize: idx < 3 ? "1.75rem" : "0.9rem",
                            fontWeight: 800,
                            minWidth: "2.5rem",
                            textAlign: "center",
                          }}
                        >
                          {medal}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 800,
                              fontSize: "1rem",
                              color: "#0f172a",
                            }}
                          >
                            {entry.name}
                          </div>
                          {avgMins !== null && (
                            <div
                              style={{
                                fontSize: "0.7rem",
                                color: "#64748b",
                                marginTop: "0.15rem",
                              }}
                            >
                              avg {avgMins}m per job
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              fontSize: "2rem",
                              fontWeight: 800,
                              lineHeight: 1,
                              color: idx === 0 ? "#b45309" : "#0f172a",
                            }}
                          >
                            {entry.count}
                          </div>
                          <div
                            style={{
                              fontSize: "0.65rem",
                              fontWeight: 700,
                              color: "#94a3b8",
                              textTransform: "uppercase",
                            }}
                          >
                            jobs
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showReassignModal && (
        <ReassignModal
          job={showReassignModal}
          targetId={reassignTargetId}
          setTargetId={setReassignTargetId}
          notes={reassignNotes}
          setNotes={setReassignNotes}
          onClose={() => {
            setShowReassignModal(null);
            setReassignTargetId("");
            setReassignNotes("");
          }}
          onSubmit={reassignJobMutation.mutate}
          isPending={reassignJobMutation.isPending}
          onlineStaffIds={onlineStaffIds}
          busyStaffIds={busyStaffIds}
          assignmentStaffList={assignmentStaffList}
          configs={configs}
        />
      )}

      {showViewModal && (
        <JobDetailModal
          job={showViewModal}
          onClose={() => setShowViewModal(null)}
          setViewImage={setViewImage}
          onTakeJob={async (batch: boolean) => {
            try {
              await startSessionMutation.mutateAsync();
              reassignJobMutation.mutate(
                {
                  jobId: showViewModal._id,
                  toStaffId: profile?._id || profile?.id,
                  notes: "Self-assigned by Admin",
                  forceMode: "PUSH",
                  batchMode: batch,
                },
                {
                  onSuccess: () => {
                    setShowViewModal(null);
                    navigate("/prepress/queue");
                  },
                },
              );
            } catch (err) {
              console.error("Take Job Error:", err);
              alert("Failed to start session. Please try again.");
            }
          }}
          onRetrieveJob={(job: any) => setShowRetrieveModal(job)}
        />
      )}

      {showRetrieveModal && (
        <RetrieveModal
          job={showRetrieveModal}
          onClose={() => setShowRetrieveModal(null)}
          onConfirm={(toStaffId: string | null) => {
            retrieveJobMutation.mutate({
              jobId: showRetrieveModal._id,
              toStaffId,
            });
          }}
          staffList={staffList}
        />
      )}

      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header-luxury">
              <h2>SYSTEM SETTINGS</h2>
              <button className="close-btn" onClick={() => setShowSettingsModal(false)}>×</button>
            </div>
            
            <div className="modal-body-scrollable" style={{ padding: '1.5rem' }}>
               <div className="settings-section-premium">
                 <div className="settings-item-elite">
                   <div className="settings-info">
                     <div className="settings-label">Walk-in GPS Verification</div>
                     <div className="settings-desc">Require customers to share location to verify they are at the press premises. Disabling this allows uploads from anywhere (useful if testing without HTTPS).</div>
                   </div>
                   <div className="settings-action">
                     <label className="switch-elite">
                       <input 
                         type="checkbox" 
                         checked={configs?.find((c: any) => c.key === 'walkinGeoRequired')?.value !== false}
                         onChange={(e) => updateConfigMutation.mutate({ key: 'walkinGeoRequired', value: e.target.checked })}
                       />
                       <span className="slider-elite round"></span>
                     </label>
                   </div>
                 </div>
                 
                 <div style={{ marginTop: '2rem', borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem' }}>
                    <div className="settings-label" style={{ marginBottom: '1rem' }}>Reassignment Reasons & Rules</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {configs?.find((c: any) => c.key === 'reassignment_reasons')?.value?.map((reason: any, ridx: number) => (
                        <div key={reason.id} style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>{reason.label}</span>
                            <button 
                              style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
                              onClick={() => {
                                const current = configs.find((c: any) => c.key === 'reassignment_reasons').value;
                                const updated = current.filter((_: any, i: number) => i !== ridx);
                                updateConfigMutation.mutate({ key: 'reassignment_reasons', value: updated });
                              }}
                            >
                              REMOVE
                            </button>
                          </div>
                          <div style={{ display: 'flex', gap: '1rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>
                              <input 
                                type="checkbox" 
                                checked={reason.requireReview} 
                                onChange={(e) => {
                                  const current = configs.find((c: any) => c.key === 'reassignment_reasons').value;
                                  current[ridx].requireReview = e.target.checked;
                                  updateConfigMutation.mutate({ key: 'reassignment_reasons', value: [...current] });
                                }}
                              />
                              ADMIN REVIEW
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>
                              <input 
                                type="checkbox" 
                                checked={reason.allowHold} 
                                onChange={(e) => {
                                  const current = configs.find((c: any) => c.key === 'reassignment_reasons').value;
                                  current[ridx].allowHold = e.target.checked;
                                  updateConfigMutation.mutate({ key: 'reassignment_reasons', value: [...current] });
                                }}
                              />
                              SELF HOLD
                            </label>
                          </div>
                        </div>
                      ))}
                      
                      <button 
                        className="btn-supreme-white"
                        style={{ padding: '0.5rem', fontSize: '0.75rem', marginTop: '0.5rem' }}
                        onClick={() => {
                          const label = prompt('Enter reason label:');
                          if (!label) return;
                          const current = configs.find((c: any) => c.key === 'reassignment_reasons')?.value || [];
                          const updated = [...current, { id: label.toLowerCase().replace(/\s/g, '_'), label, requireReview: true, allowHold: false }];
                          updateConfigMutation.mutate({ key: 'reassignment_reasons', value: updated });
                        }}
                      >
                        + ADD NEW REASON
                      </button>
                    </div>
                 </div>
               </div>
            </div>

            <div className="modal-footer-luxury">
              <button className="btn-supreme-black" onClick={() => setShowSettingsModal(false)}>DONE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReassignModal({
  job,
  targetId,
  setTargetId,
  notes,
  setNotes,
  onClose,
  onSubmit,
  isPending,
  onlineStaffIds,
  busyStaffIds,
  assignmentStaffList,
  configs,
}: any) {
  const [forceMode, setForceMode] = useState<"PUSH" | "PARK">("PARK");
  const [batchMode, setBatchMode] = useState(true);

  const isTargetBusy = targetId && busyStaffIds.has(targetId);

  return (
    <div className="modal-overlay">
      <div
        className="modal-content-luxury animate-in zoom-in-95"
        style={{ maxWidth: "520px" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.5rem",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "0.95rem",
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Force Reassign Job
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.5rem",
              cursor: "pointer",
              color: "#94a3b8",
            }}
          >
            &times;
          </button>
        </div>

        <div
          style={{
            background: "#f8fafc",
            padding: "1rem",
            borderRadius: "0.75rem",
            marginBottom: "1.5rem",
            fontSize: "0.875rem",
          }}
        >
          <strong>Job:</strong> #{job._id.substring(18).toUpperCase()} -{" "}
          {job.customerName}
          <br />
          <strong>Currently Assigned To:</strong>{" "}
          {job.assignedTo?.name || "Nobody"}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: 800,
                fontSize: "0.875rem",
                color: "#475569",
              }}
            >
              New Staff Member
            </label>
            <select
              className="search-input-elite"
              style={{ width: "100%", padding: "0.75rem" }}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">Select a designer...</option>
              <option value="pool">↩ Return to General Pool</option>
              {assignmentStaffList.map((s: any) => {
                const isOnline = onlineStaffIds.has(s._id);
                const isBusy = busyStaffIds.has(s._id);
                return (
                  <option key={s._id} value={s._id}>
                    {isOnline ? "🟢" : "⚪"} {s.name}{" "}
                    {s._id === job.assignedTo?._id ? "(Current)" : ""}{" "}
                    {!isOnline ? "(OFFLINE)" : isBusy ? "(BUSY)" : "(READY)"}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: 800,
                fontSize: "0.875rem",
                color: "#475569",
              }}
            >
              Reassignment Reason (Optional Preset)
            </label>
            <select
              className="search-input-elite"
              style={{ width: "100%", padding: "0.75rem", marginBottom: '0.75rem' }}
              onChange={(e) => setNotes((prev: string) => prev ? `${prev}\nReason: ${e.target.value}` : `Reason: ${e.target.value}`)}
            >
              <option value="">Select a reason...</option>
              {configs?.find((c: any) => c.key === 'reassignment_reasons')?.value?.map((r: any) => (
                <option key={r.id} value={r.label}>{r.label}</option>
              ))}
            </select>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: 800,
                fontSize: "0.875rem",
                color: "#475569",
              }}
            >
              Reassignment Notes (Instructions)
            </label>
            <textarea
              className="search-input-elite"
              style={{
                width: "100%",
                minHeight: "80px",
                padding: "0.75rem",
                resize: "vertical",
              }}
              placeholder="Provide context for the next designer..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div
            style={{
              background: "#f0f9ff",
              padding: "1rem",
              borderRadius: "0.75rem",
              border: "1px solid #e0f2fe",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                cursor: "pointer",
                marginBottom: "0.5rem",
              }}
            >
              <input
                type="checkbox"
                checked={batchMode}
                onChange={(e) => setBatchMode(e.target.checked)}
                style={{ width: "1.2rem", height: "1.2rem" }}
              />
              <span
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 800,
                  color: "#0369a1",
                }}
              >
                Move all pending jobs for this customer
              </span>
            </label>
            <p
              style={{
                margin: 0,
                fontSize: "0.7rem",
                color: "#0ea5e9",
                paddingLeft: "2rem",
              }}
            >
              Ensures the entire conversation stays with one person.
            </p>
          </div>

          {isTargetBusy && (
            <div
              style={{
                background: "#fffbeb",
                padding: "1rem",
                borderRadius: "0.75rem",
                border: "1px solid #fef3c7",
                animation: "shake 0.4s",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.75rem",
                }}
              >
                <span style={{ fontSize: "1.2rem" }}>⚠️</span>
                <span
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 800,
                    color: "#92400e",
                  }}
                >
                  DESIGNER IS CURRENTLY BUSY
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    cursor: "pointer",
                    padding: "0.5rem",
                    borderRadius: "0.5rem",
                    background: forceMode === "PARK" ? "white" : "transparent",
                    border:
                      forceMode === "PARK"
                        ? "1px solid #fcd34d"
                        : "1px solid transparent",
                  }}
                >
                  <input
                    type="radio"
                    name="forceBehavior"
                    checked={forceMode === "PARK"}
                    onChange={() => setForceMode("PARK")}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: "0.8125rem",
                        fontWeight: 800,
                        color: "#b45309",
                      }}
                    >
                      Park as Next Job (Recommended)
                    </div>
                    <div style={{ fontSize: "0.65rem", color: "#d97706" }}>
                      Work stays reserved in their queue. No interruption.
                    </div>
                  </div>
                </label>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    cursor: "pointer",
                    padding: "0.5rem",
                    borderRadius: "0.5rem",
                    background:
                      forceMode === "PUSH" ? "#fef2f2" : "transparent",
                    border:
                      forceMode === "PUSH"
                        ? "1px solid #fca5a5"
                        : "1px solid transparent",
                  }}
                >
                  <input
                    type="radio"
                    name="forceBehavior"
                    checked={forceMode === "PUSH"}
                    onChange={() => setForceMode("PUSH")}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: "0.8125rem",
                        fontWeight: 800,
                        color: "#991b1b",
                      }}
                    >
                      Interruption: Force to Active Slot
                    </div>
                    <div style={{ fontSize: "0.65rem", color: "#ef4444" }}>
                      Pauses their current job. They must do this NOW.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "1rem" }}
        >
          <button
            onClick={onClose}
            disabled={isPending}
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "2rem",
              border: "none",
              background: "#f1f5f9",
              color: "#475569",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            disabled={
              !targetId || targetId === job.assignedTo?._id || isPending
            }
            onClick={() => {
              if (targetId === "pool") {
                if (
                  window.confirm(
                    "Return this job to the general pool? It will be unassigned from everyone.",
                  )
                ) {
                  onSubmit({
                    jobId: job._id,
                    toStaffId: null,
                    notes,
                    batchMode,
                  });
                }
                return;
              }
              const isOnline = onlineStaffIds.has(targetId);
              if (
                !isOnline &&
                !window.confirm(
                  "Target staff is OFFLINE. Force-reassigning will create a pending pin for them instead of an immediate active assignment. Proceed?",
                )
              )
                return;
              onSubmit({
                jobId: job._id,
                toStaffId: targetId,
                notes,
                forceMode,
                batchMode,
              });
            }}
            style={{
              padding: "0.75rem 1.75rem",
              borderRadius: "2rem",
              border: "none",
              background: "#d97706",
              color: "white",
              fontWeight: 800,
              cursor:
                targetId && targetId !== job.assignedTo?._id
                  ? "pointer"
                  : "not-allowed",
              opacity: targetId && targetId !== job.assignedTo?._id ? 1 : 0.5,
              boxShadow: "0 4px 12px rgba(217,119,6,0.2)",
            }}
          >
            {isPending ? "Processing..." : "Execute Reassignment ⤨"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RetrieveModal({
  job,
  onClose,
  onConfirm,
  staffList,
}: {
  job: any;
  onClose: () => void;
  onConfirm: (toStaffId: string | null) => void;
  staffList: any[];
}) {
  const [selectedStaff, setSelectedStaff] = useState<string>("");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="job-detail-modal-elite"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "450px", minHeight: "auto" }}
      >
        <div className="modal-header-elite">
          <div className="header-info">
            <h2 className="modal-title-elite">Retrieve Job</h2>
            <span className="modal-ref-elite">
              #REF: {job._id.substring(18).toUpperCase()}
            </span>
          </div>
          <button className="modal-close-btn-elite" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body-elite" style={{ padding: "1.5rem" }}>
          <p
            style={{
              fontSize: "0.875rem",
              color: "#475569",
              marginBottom: "1.5rem",
              fontWeight: 500,
            }}
          >
            Mistakenly completed? Select where to return this job:
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <button
              className="btn-supreme-black"
              style={{
                width: "100%",
                padding: "0.875rem",
                borderRadius: "0.5rem",
                fontWeight: 800,
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
              onClick={() => onConfirm(null)}
            >
              ↩ RETURN TO GENERAL QUEUE
            </button>

            <div
              style={{
                padding: "1.25rem",
                background: "#f8fafc",
                borderRadius: "0.875rem",
                border: "1px solid #e2e8f0",
              }}
            >
              <p
                style={{
                  fontSize: "0.65rem",
                  fontWeight: 900,
                  color: "#64748b",
                  marginBottom: "0.75rem",
                  letterSpacing: "0.05em",
                }}
              >
                OR PIN TO SPECIFIC STAFF
              </p>
              <select
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "0.5rem",
                  border: "1.2px solid #cbd5e1",
                  marginBottom: "1rem",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  outline: "none",
                }}
              >
                <option value="">Select Designer...</option>
                {staffList
                  ?.filter((s) => s.role === "PREPRESS")
                  .map((s: any) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              <button
                className="btn-supreme-white"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  borderRadius: "0.5rem",
                  border: "1.5px solid #0ea5e9",
                  background: "white",
                  color: "#0369a1",
                  fontWeight: 800,
                  fontSize: "0.8rem",
                  cursor: "pointer",
                }}
                disabled={!selectedStaff}
                onClick={() => onConfirm(selectedStaff)}
              >
                PIN & RETRIEVE
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function JobDetailModal({
  job,
  onClose,
  setViewImage,
  onTakeJob,
  onRetrieveJob,
}: {
  job: any;
  onClose: () => void;
  setViewImage: (url: string) => void;
  onTakeJob: (batch: boolean) => void;
  onRetrieveJob: (job: any) => void;
}) {
  if (!job) return null;
  const isImage = (f: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="job-detail-modal-elite"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-elite">
          <div className="header-info">
            <h2 className="modal-title-elite">
              Job Details — {job.customerName}
            </h2>
            <span className="modal-ref-elite">
              #REF: {job._id.substring(18).toUpperCase()}
            </span>
          </div>

          {job.status === "COMPLETED" || job.status === "DISPATCHED" ? (
            <div style={{ marginLeft: "auto", marginRight: "1rem" }}>
              <button
                className="btn-supreme-black"
                style={{
                  padding: "0.4rem 1.25rem",
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  borderRadius: "0.4rem",
                  cursor: "pointer",
                  background: "#1e293b",
                  border: "none",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
                onClick={() => onRetrieveJob(job)}
              >
                <span>↩</span> RETRIEVE TO QUEUE
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                marginLeft: "auto",
                marginRight: "1rem",
              }}
            >
              <button
                className="btn-supreme-black"
                style={{
                  padding: "0.4rem 1rem",
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  borderRadius: "0.4rem",
                  cursor: "pointer",
                }}
                onClick={() => onTakeJob(false)}
              >
                TAKE
              </button>
              <button
                className="btn-supreme-white"
                style={{
                  padding: "0.4rem 1rem",
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  borderRadius: "0.4rem",
                  cursor: "pointer",
                  border: "1.5px solid #0ea5e9",
                  background: "white",
                  color: "#0369a1",
                }}
                onClick={() => onTakeJob(true)}
              >
                TAKE BATCH
              </button>
            </div>
          )}

          <button className="modal-close-btn-elite" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body-elite">
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "2rem",
              marginBottom: "1.5rem",
              background: "#f8fafc",
              padding: "1rem",
              borderRadius: "0.75rem",
              border: "1px solid #e2e8f0",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "#64748b",
                  fontWeight: 700,
                }}
              >
                RECEIVED:
              </span>
              <br />
              <strong>{new Date(job.createdAt).toLocaleString()}</strong>
            </div>
            {job.dueBy && (
              <div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "#64748b",
                    fontWeight: 700,
                  }}
                >
                  DUE BY:
                </span>
                <br />
                <strong style={{ color: "#ef4444" }}>
                  {new Date(job.dueBy).toLocaleString()}
                </strong>
              </div>
            )}
            {job.completedAt && (
              <div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "#64748b",
                    fontWeight: 700,
                  }}
                >
                  COMPLETED:
                </span>
                <br />
                <strong style={{ color: "#10b981" }}>
                  {new Date(job.completedAt).toLocaleString()}
                </strong>
              </div>
            )}
            <div>
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "#64748b",
                  fontWeight: 700,
                }}
              >
                STATUS:
              </span>
              <br />
              <strong>{job.status}</strong>
            </div>
          </div>

          <h4
            style={{
              marginBottom: "0.5rem",
              fontSize: "1rem",
              color: "#1e293b",
            }}
          >
            Subject
          </h4>
          <div
            style={{
              background: "#fff",
              padding: "1rem",
              borderRadius: "0.5rem",
              border: "1px solid #cbd5e1",
              marginBottom: "1.5rem",
              fontWeight: 600,
            }}
          >
            {job.emailSubject || "(No Subject)"}
          </div>

          <h4
            style={{
              marginBottom: "0.5rem",
              fontSize: "1rem",
              color: "#1e293b",
            }}
          >
            Body Content
          </h4>
          <div
            style={{
              background: "#fff",
              padding: "1.5rem",
              borderRadius: "0.5rem",
              border: "1px solid #cbd5e1",
              marginBottom: "2rem",
              whiteSpace: "pre-wrap",
              fontSize: "0.9rem",
              lineHeight: "1.5",
            }}
          >
            <LinkifiedText text={job.mailBody || "(No Body Content)"} />
          </div>

          <h4
            style={{
              marginBottom: "0.5rem",
              fontSize: "1rem",
              color: "#1e293b",
            }}
          >
            Attachments ({job.attachments?.length || 0})
          </h4>
          {job.attachments && job.attachments.length > 0 ? (
            <div className="admin-screenshots-grid">
              {job.attachments.map((file: string, sIdx: number) => {
                const encodedPath = encodeURIComponent(job.relativeFolderPath || "");
                const encodedFile = encodeURIComponent(file);
                const fileUrl = `${BACKEND_URL}/job-files/${encodedPath}/${encodedFile}?token=${localStorage.getItem("token")}`;
                return (
                  <div
                    key={sIdx}
                    className="admin-attachment-wrapper"
                    onClick={() =>
                      isImage(file)
                        ? setViewImage(fileUrl)
                        : window.open(fileUrl)
                    }
                    title={file}
                  >
                    <div className="admin-screenshot-item">
                      {isImage(file) ? (
                        <img src={fileUrl} alt={file} />
                      ) : (
                        <div className="admin-file-placeholder">
                          <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="admin-file-label-box">
                      <span className="admin-file-name">{file}</span>
                      <span className="admin-file-size">View File →</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: "#94a3b8", fontStyle: "italic" }}>
              No attachments found.
            </div>
          )}

          <div style={{ height: "1rem" }} />

        </div>
      </div>
    </div>
  );
}

// ── STAFF INSIGHT MODAL ──────────────────────────────────────────────────
function StaffInsightModal({ staff, onClose }: { staff: any, onClose: () => void }) {
  const { data: workspace, isLoading } = useQuery({
    queryKey: ['staff-workspace', staff._id || staff.id],
    queryFn: () => queueApi.getStaffWorkspace(staff._id || staff.id),
    refetchInterval: 10000
  })

  const renderJobLane = (title: string, jobs: any[], color: string) => (
    <div className="si-lane">
      <div className="si-lane-header" style={{ borderLeft: `4px solid ${color}` }}>
        {title} <span className="si-count">{jobs?.length || 0}</span>
      </div>
      <div className="si-lane-scroll">
        {!jobs || jobs.length === 0 ? (
          <div className="si-empty">None</div>
        ) : (
          jobs.map(j => (
            <div key={j._id} className="si-job-pill">
              <div className="si-job-name">{j.customerName}</div>
              <div className="si-job-id">#{j._id.substring(18).toUpperCase()}</div>
              {j.status === 'PAUSED' && <div className="si-job-meta">Paused: {j.pauseReason || 'Hold'}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal staff-insight-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '90%' }}>
        <div className="modal-header-premium">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
             <div className="designer-avatar" style={{ width: '40px', height: '40px' }}>{staff.name?.charAt(0)}</div>
             <div>
                <h2 style={{ margin: 0 }}>Designer Focus: {staff.name}</h2>
                <p style={{ margin: 0, opacity: 0.7 }}>Real-time workspace health</p>
             </div>
          </div>
          <button className="close-btn-p" onClick={onClose}>&times;</button>
        </div>

        {isLoading ? (
          <div style={{ padding: '4rem', textAlign: 'center' }}>Syncing Insight...</div>
        ) : (
          <div className="si-workspace-grid">
            {renderJobLane('ACTIVE NOW', workspace?.active || [], '#10b981')}
            {renderJobLane('HELD / PAUSED', workspace?.held || [], '#f59e0b')}
            {renderJobLane('RESERVED QUEUE', workspace?.reserved || [], '#6366f1')}
          </div>
        )}
      </div>
    </div>
  )
}
