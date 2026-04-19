const DAY_MS = 24 * 60 * 60 * 1000;
const HEALTH_ACTIVITY_WINDOW_DAYS = 7;

export const PROJECT_HEALTH = {
  ACTIVE: "Active",
  AT_RISK: "At Risk",
  STALLED: "Stalled",
};

export const resolveTaskOwnership = (task, memberMap, currentUserId) => {
  const assigneeId = task?.assignee_id || task?.assigned_to || null;
  const assignee = assigneeId ? (memberMap?.[assigneeId] || null) : null;
  const isUnassigned = !assignee;
  const isAssignedToMe = !!assignee && assignee.id === currentUserId;
  return { assignee, isUnassigned, isAssignedToMe };
};

export const computeProjectHealth = (project, projectTasks, options = {}) => {
  const now = options.now ? new Date(options.now) : new Date();
  const memberMap = options.memberMap || {};
  const currentUserId = options.currentUserId || null;
  const activityTimestamps = [
    project?.updated_at,
    project?.last_activity_at,
    ...(options.activityTimestamps || []),
  ].filter(Boolean);

  const openTasks = (projectTasks || []).filter((task) => !task.done);
  const overdueTasks = openTasks.filter((task) => task.due_date && new Date(task.due_date).getTime() < now.getTime());
  const unassignedTasks = openTasks.filter((task) => resolveTaskOwnership(task, memberMap, currentUserId).isUnassigned);
  const ownedAssignees = new Set(
    openTasks
      .map((task) => resolveTaskOwnership(task, memberMap, currentUserId).assignee?.id)
      .filter(Boolean),
  );
  const hasUnevenOwnership = openTasks.length >= 4 && ownedAssignees.size <= 1;

  const mostRecentActivity = activityTimestamps
    .map((ts) => new Date(ts).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];
  const hasRecentActivity = Boolean(
    mostRecentActivity && (now.getTime() - mostRecentActivity) <= HEALTH_ACTIVITY_WINDOW_DAYS * DAY_MS,
  );
  const noProgressSignals = openTasks.length > 0 && !hasRecentActivity && overdueTasks.length === 0;

  const stalledByUnassigned = openTasks.length >= 3 && unassignedTasks.length >= Math.ceil(openTasks.length * 0.6);
  const stalledByNoActivity = openTasks.length > 0 && !hasRecentActivity;

  if (stalledByUnassigned || stalledByNoActivity || noProgressSignals) {
    const reason = stalledByUnassigned
      ? `${unassignedTasks.length} unassigned tasks`
      : !hasRecentActivity
        ? "No recent activity"
        : "No progress signals";
    return { status: PROJECT_HEALTH.STALLED, reason };
  }

  if (overdueTasks.length > 0 || unassignedTasks.length > 0 || hasUnevenOwnership) {
    const reason = overdueTasks.length > 0
      ? `${overdueTasks.length} overdue tasks`
      : unassignedTasks.length > 0
        ? `${unassignedTasks.length} unassigned tasks`
        : "Ownership is uneven";
    return { status: PROJECT_HEALTH.AT_RISK, reason };
  }

  return { status: PROJECT_HEALTH.ACTIVE, reason: "Healthy task ownership" };
};
