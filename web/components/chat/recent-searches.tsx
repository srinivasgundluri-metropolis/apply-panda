"use client";

import * as React from "react";
import { Clock, Trash2, RotateCw, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { RecentSearch } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface RecentSearchesProps {
  searches: RecentSearch[];
  onShow: (search: RecentSearch) => void;
  onReplay: (search: RecentSearch) => void;
  onClear: () => void;
}

/**
 * Last few LinkedIn job-search results that returned a `jobs-json` block —
 * cached so you can re-open or replay without hitting the agent again.
 * Separate from chat transcript persistence (stored under a different localStorage key).
 */
export function RecentSearches({
  searches,
  onShow,
  onReplay,
  onClear,
}: RecentSearchesProps) {
  if (searches.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xs font-medium text-muted-foreground tracking-wide uppercase flex items-center gap-1.5">
            <Clock className="size-3.5" />
            Recent LinkedIn job searches
          </h3>
          <p className="text-[11px] text-muted-foreground mt-1 pr-12">
            Up to four saved search results (requires jobs in the agent reply).
            Not the same as your chat transcript.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-7 text-xs"
        >
          <Trash2 className="size-3" />
          Clear
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {searches.map((s, i) => (
          <Card
            key={`${s.timestamp}-${i}`}
            className="px-3 py-3 gap-2 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{s.prompt}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(s.timestamp)} · {s.count} job
                  {s.count === 1 ? "" : "s"}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] shrink-0">
                cached
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="secondary"
                className="h-7 flex-1 text-xs"
                onClick={() => onShow(s)}
              >
                <Eye className="size-3" />
                Show
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 flex-1 text-xs"
                onClick={() => onReplay(s)}
              >
                <RotateCw className="size-3" />
                Replay
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
