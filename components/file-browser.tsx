"use client";

import { useEffect, useMemo, useState } from "react";
import { estimateTokens } from "@/lib/tokens";
import type { ExamFile } from "@/lib/types";
import { CopyGuard } from "./copy-guard";
import { FileViewer } from "./file-viewer";

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;

type TreeNode = {
  id: string;
  name: string;
  fileId?: string;
  tokens?: number;
  children: TreeNode[];
};

function insertFile(roots: TreeNode[], file: ExamFile) {
  const parts = file.name.split("/").filter(Boolean);
  let level = roots;
  let path = "";
  parts.forEach((part, index) => {
    path = path ? `${path}/${part}` : part;
    const leaf = index === parts.length - 1;
    let node = level.find((item) => item.name === part && Boolean(item.fileId) === leaf);
    if (!node) {
      node = leaf
        ? { id: file.id, name: part, fileId: file.id, tokens: estimateTokens(file.content), children: [] }
        : { id: `dir:${path}`, name: part, children: [] };
      level.push(node);
    }
    level = node.children;
  });
}

function treeFromFiles(files: ExamFile[]): TreeNode[] {
  const roots: TreeNode[] = [];
  for (const file of files) insertFile(roots, file);
  return roots;
}

function formatTokens(value: number): string {
  return value.toLocaleString("ko-KR");
}

export function FileBrowser({
  files,
  activeId,
  onOpen,
  copyProtection = false,
}: {
  files: ExamFile[];
  activeId: string | null;
  onOpen: (id: string) => void;
  copyProtection?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [zoom, setZoom] = useState(100);
  const [full, setFull] = useState(false);
  const active = files.find((file) => file.id === activeId) ?? files[0] ?? null;
  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () => (needle ? files.filter((file) => file.name.toLowerCase().includes(needle)) : files),
    [files, needle],
  );
  const tree = useMemo(() => treeFromFiles(visible), [visible]);

  useEffect(() => {
    if (!full) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  function renderNode(node: TreeNode, depth: number) {
    const folder = !node.fileId;
    const open = !collapsed[node.id];
    return (
      <div key={node.id}>
        <button
          type="button"
          role="treeitem"
          aria-expanded={folder ? open : undefined}
          aria-selected={node.fileId != null && node.fileId === active?.id}
          className={`file-tree-row${node.fileId && node.fileId === active?.id ? " selected" : ""}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => {
            if (folder) {
              setCollapsed((prev) => ({ ...prev, [node.id]: !prev[node.id] }));
              return;
            }
            if (node.fileId) onOpen(node.fileId);
          }}
        >
          <span className="file-tree-kind" aria-hidden="true">
            {folder ? (open ? "▾" : "▸") : "📄"}
          </span>
          <span className="file-tree-name">{node.name}</span>
          <span className="file-tree-tokens">{node.tokens != null ? formatTokens(node.tokens) : ""}</span>
        </button>
        {folder && open ? node.children.map((child) => renderNode(child, depth + 1)) : null}
      </div>
    );
  }

  return (
    <div className="file-browser">
      <div className="file-browser-title">
        <strong>파일 목록</strong>
        <button type="button" className="file-search-btn" aria-label="파일 검색" aria-expanded={searchOpen} onClick={() => setSearchOpen((open) => !open)}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10.5 10.5 L14 14" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
        {searchOpen ? (
          <input
            className="file-search"
            value={query}
            placeholder="파일명"
            aria-label="파일명 검색"
            onChange={(event) => setQuery(event.target.value)}
          />
        ) : null}
      </div>
      <div className="file-browser-split">
        <div className="file-tree" role="tree" aria-label="파일 목록" data-testid="file-tree">
          <div className="file-tree-head">
            <span />
            <span>파일명</span>
            <span>토큰량</span>
          </div>
          {tree.length === 0 ? <p className="file-tree-empty">해당하는 파일이 없습니다.</p> : tree.map((node) => renderNode(node, 0))}
        </div>
        <section className={`file-stage${full ? " full" : ""}`} aria-label="파일 미리보기">
          <div className="file-stage-bar">
            <strong data-testid="file-preview-name">{active ? active.name : "파일 없음"}</strong>
            <span className="file-stage-tokens">{active ? `${formatTokens(estimateTokens(active.content))} 토큰` : ""}</span>
            <button type="button" className="file-full-btn" aria-label={full ? "전체화면 닫기" : "전체화면"} onClick={() => setFull((value) => !value)}>
              {full ? "닫기" : "전체화면"}
            </button>
          </div>
          <div className="desktop-preview">
            <CopyGuard enabled={copyProtection} className="preview-guard">
              <div className="desktop-zoom" style={{ zoom: `${zoom}%` }}>
                {active ? <FileViewer file={active} /> : <p className="empty-chat">자료 파일이 없습니다.</p>}
              </div>
            </CopyGuard>
          </div>
          <div className="zoom-overlay" aria-label="미리보기 배율">
            <button type="button" onClick={() => setZoom((value) => Math.max(ZOOM_MIN, value - 10))} aria-label="축소">
              −
            </button>
            <span>{zoom}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(ZOOM_MAX, value + 10))} aria-label="확대">
              +
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
