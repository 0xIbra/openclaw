import { useState } from "react";
import type { TaskReviewDto } from "@/types";
import { NeonBadge } from "@/components/tron/NeonBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { timeAgo } from "@/lib/format";
import { useTasksStore } from "@/stores";

type TaskReviewPanelProps = {
  review: TaskReviewDto;
};

const STATUS_VARIANT: Record<string, "cyan" | "green" | "red" | "orange" | "muted"> = {
  pending_lead: "cyan",
  pending_human: "orange",
  approved: "green",
  rejected: "red",
  blocked: "muted",
};

export function TaskReviewPanel({ review }: TaskReviewPanelProps) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const approveReview = useTasksStore((s) => s.approveReview);
  const rejectReview = useTasksStore((s) => s.rejectReview);

  const canAct = review.status === "pending_human";

  const handleApprove = async () => {
    setLoading(true);
    try {
      await approveReview(review.taskId, review.id, reason);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await rejectReview(review.taskId, review.id, reason);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-tron-border rounded-sm p-4 bg-tron-surface2 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Review</span>
        <NeonBadge variant={STATUS_VARIANT[review.status] ?? "muted"}>
          {review.status.replace("_", " ")}
        </NeonBadge>
      </div>
      <div className="text-xs text-tron-muted-fg">
        <p>
          Lead: <span className="text-foreground font-mono">{review.leadAgentId}</span>
        </p>
        <p className="mt-0.5">Created: {timeAgo(review.createdAtMs)}</p>
      </div>
      {review.decisionReason && (
        <p className="text-xs text-foreground border-l-2 border-tron-cyan pl-2">
          {review.decisionReason}
        </p>
      )}
      {canAct && (
        <div className="space-y-2 pt-1">
          <Textarea
            value={reason}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
            placeholder="Optional reason..."
            rows={2}
            className="text-xs bg-tron-surface border-tron-border resize-none"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={loading}
              className="bg-tron-green/20 text-tron-green border border-tron-green/40 hover:bg-tron-green/30"
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReject}
              disabled={loading}
              className="border-tron-red/40 text-tron-red hover:bg-tron-red/10"
            >
              Reject
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
