"use client";

import * as React from "react";
import { DEFAULT_PORTAL_CATALOG, DEFAULT_PORTAL_CATALOG_SIZE } from "@/lib/default-portal-catalog";
import { portalCatalogKey } from "@/lib/portal-catalog-keys";
import {
  allCatalogKeys,
  presetApproxEuUkKeys,
  presetApproxUsKeys,
} from "@/lib/portal-catalog-presets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  selectedKeys: Set<string>;
  onSelectedKeysChange: (next: Set<string>) => void;
};

export function EmployerBoardPicker({ selectedKeys, onSelectedKeysChange }: Props) {
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [...DEFAULT_PORTAL_CATALOG];
    return DEFAULT_PORTAL_CATALOG.filter((c) =>
      (c.name ?? "").toLowerCase().includes(q),
    );
  }, [search]);

  const toggle = (key: string) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedKeysChange(next);
  };

  const selectAllFiltered = () => {
    const next = new Set(selectedKeys);
    for (const c of filtered) {
      next.add(portalCatalogKey(c));
    }
    onSelectedKeysChange(next);
  };

  const clearFiltered = () => {
    const remove = new Set(filtered.map((c) => portalCatalogKey(c)));
    const next = new Set([...selectedKeys].filter((k) => !remove.has(k)));
    onSelectedKeysChange(next);
  };

  const applyPreset = (preset: "all" | "us" | "eu" | "clear") => {
    if (preset === "clear") {
      onSelectedKeysChange(new Set());
      return;
    }
    if (preset === "all") {
      onSelectedKeysChange(allCatalogKeys());
      return;
    }
    if (preset === "us") {
      onSelectedKeysChange(presetApproxUsKeys());
      return;
    }
    onSelectedKeysChange(presetApproxEuUkKeys());
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="grid gap-1.5 flex-1 min-w-[200px]">
          <Label htmlFor="employer_search">Search employers</Label>
          <Input
            id="employer_search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by company name…"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => applyPreset("all")}>
            Select all ({DEFAULT_PORTAL_CATALOG_SIZE})
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("us")}>
            US-heavy preset
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("eu")}>
            EU / UK preset
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("clear")}>
            Clear all
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        “US-heavy” and “EU / UK” are rough shortcuts (HQ guesses), not legal registration filters.
        Use search or pick individually when you want exact control.
      </p>

      <div className="flex flex-wrap gap-2 border rounded-md p-2 bg-muted/20">
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={selectAllFiltered}>
          Add all in filtered list ({filtered.length})
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFiltered}>
          Remove filtered from selection
        </Button>
      </div>

      <div
        className="max-h-[min(320px,50vh)] overflow-y-auto rounded-md border bg-background px-2 py-2 space-y-0.5"
        role="group"
        aria-label="Employer ATS boards"
      >
        {filtered.map((c) => {
          const key = portalCatalogKey(c);
          const id = `board-${key.replace(/[^a-z0-9]+/gi, "-")}`;
          return (
            <label
              key={key}
              htmlFor={id}
              className="flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted/60"
            >
              <input
                id={id}
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-primary"
                checked={selectedKeys.has(key)}
                onChange={() => toggle(key)}
              />
              <span className="leading-snug">
                <span className="font-medium text-foreground">{c.name}</span>
              </span>
            </label>
          );
        })}
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground px-1 py-3 text-center">No employers match that search.</p>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Selected: <strong className="text-foreground">{selectedKeys.size}</strong> board
        {selectedKeys.size === 1 ? "" : "s"}
      </p>
    </div>
  );
}
