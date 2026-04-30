"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TableProperties,
  MessageSquare,
  Workflow,
  Search,
  FileText,
  UserRound,
  Sparkles,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

interface SidebarProps {
  candidateName: string;
  candidateInitials: string;
  candidateLocation: string;
  candidateEmail: string;
}

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Status",
    icon: LayoutDashboard,
    description: "KPI overview",
  },
  {
    href: "/tracker",
    label: "Tracker",
    icon: TableProperties,
    description: "Applications + docs",
  },
  {
    href: "/chat",
    label: "Chat",
    icon: MessageSquare,
    description: "AI assistant",
  },
  {
    href: "/pipeline",
    label: "Pipeline",
    icon: Workflow,
    description: "Evaluate / scan",
  },
  {
    href: "/scan-results",
    label: "Scan Results",
    icon: Search,
    description: "Discovered jobs",
  },
  {
    href: "/documents",
    label: "Documents",
    icon: FileText,
    description: "CVs & cover letters",
  },
  {
    href: "/profile",
    label: "Profile",
    icon: UserRound,
    description: "Personal info",
  },
];

export function Sidebar({
  candidateName,
  candidateInitials,
  candidateLocation,
  candidateEmail,
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col gap-2 border-r bg-sidebar text-sidebar-foreground w-72 shrink-0 h-screen sticky top-0">
      <div className="px-5 pt-5 pb-3 flex items-center gap-2">
        <div className="size-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
          <Sparkles className="size-4" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-semibold text-sm">Career-Ops</span>
          <span className="text-xs text-muted-foreground">
            AI job search command center
          </span>
        </div>
      </div>

      <div className="px-3 py-2">
        <div className="rounded-lg border bg-card text-card-foreground p-3 flex items-center gap-3">
          <Avatar className="size-10 shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
              {candidateInitials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">
              {candidateName || "Unnamed"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {candidateLocation || candidateEmail || "Set up your profile"}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname?.startsWith(item.href));
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <div className="flex flex-col leading-tight min-w-0 flex-1">
                    <span className="truncate">{item.label}</span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {item.description}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t px-3 py-3 flex items-center justify-between gap-2">
        <Badge variant="outline" className="text-[10px]">
          local · v1
        </Badge>
        <ThemeToggle />
      </div>
    </aside>
  );
}
