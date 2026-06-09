import { Gauge } from "lucide-react";
import { useState } from "react";
import { useConfigStore } from "../../stores/configStore";
import {
  toQuotaUnits,
  formatQuotaUnits,
  formatCost,
  quotaImpactColor,
  cn,
} from "../../lib/utils";

interface QuotaCostProps {
  costUsd: number;
  className?: string;
  /** Icon size class, defaults to "w-3 h-3" */
  iconSize?: string;
}

export function QuotaCost({
  costUsd,
  className,
  iconSize = "w-3 h-3",
}: QuotaCostProps) {
  const planInfo = useConfigStore((s) => s.planInfo);
  const multiplier = planInfo?.usage_multiplier ?? 1;
  const qu = toQuotaUnits(costUsd, multiplier);
  const color = quotaImpactColor(qu);
  const [showTooltip, setShowTooltip] = useState(false);

  if (costUsd <= 0) return null;

  return (
    <span
      className={cn("relative inline-flex items-center gap-1", color, className)}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <Gauge className={iconSize} />
      <span>{formatQuotaUnits(qu)}</span>
      {!planInfo && (
        <span className="text-neutral-600 text-[9px]">?</span>
      )}
      {showTooltip && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-[10px] text-neutral-400 whitespace-nowrap z-50">
          {formatCost(costUsd)} API equiv.
          {!planInfo && " (plan not detected)"}
        </span>
      )}
    </span>
  );
}
