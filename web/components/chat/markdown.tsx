"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownProps {
  content: string;
  className?: string;
}

/**
 * Restricted markdown renderer used everywhere user-readable agent output
 * lands. Anchor tags are forced to open in a new tab with `noopener` so
 * that LinkedIn / Greenhouse links from the agent never replace our app.
 */
export function Markdown({ content, className }: MarkdownProps) {
  return (
    <div
      className={cn(
        "prose-sm prose-neutral dark:prose-invert max-w-none",
        "[&_table]:border [&_table]:rounded-md [&_table]:border-collapse [&_table]:text-sm",
        "[&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted [&_th]:text-left",
        "[&_td]:border [&_td]:px-2 [&_td]:py-1",
        "[&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline",
        "[&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-muted [&_code]:text-xs [&_code]:font-mono",
        "[&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_h1]:text-xl [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-2",
        "[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-2",
        "[&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1",
        "[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-1",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
