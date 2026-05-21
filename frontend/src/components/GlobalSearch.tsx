import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, FolderKanban, Search, Users, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

interface Result {
  type: 'client' | 'project' | 'employee';
  id: number;
  label: string;
  sub?: string;
  to: string;
}

export default function GlobalSearch() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

  // Pre-load lookup data
  useEffect(() => {
    Promise.all([
      api.get('/clients').catch(() => ({ data: [] })),
      api.get('/projects').catch(() => ({ data: [] })),
      isAdmin ? api.get('/employees').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
    ]).then(([c, p, e]) => {
      setClients(c.data); setProjects(p.data); setEmployees(e.data);
    });
  }, [isAdmin]);

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: Result[] = [];
    for (const c of clients) {
      if (c.client_name?.toLowerCase().includes(q)) {
        out.push({
          type: 'client', id: c.id, label: c.client_name, sub: 'Client',
          to: isAdmin ? `/admin/clients` : `/reports?type=client`,
        });
      }
    }
    for (const p of projects) {
      if (p.project_name?.toLowerCase().includes(q) || p.project_code?.toLowerCase().includes(q)) {
        out.push({
          type: 'project', id: p.id, label: p.project_name,
          sub: `${p.project_code || ''} · ${p.client_name || 'Project'}`,
          to: isAdmin ? `/admin/projects` : `/tasks`,
        });
      }
    }
    if (isAdmin) {
      for (const e of employees) {
        if (
          e.name?.toLowerCase().includes(q) ||
          e.email?.toLowerCase().includes(q) ||
          e.employee_code?.toLowerCase().includes(q)
        ) {
          out.push({
            type: 'employee', id: e.id, label: e.name,
            sub: `${e.employee_code || ''} · ${e.email}`,
            to: `/admin/employees`,
          });
        }
      }
    }
    return out.slice(0, 12);
  }, [query, clients, projects, employees, isAdmin]);

  const iconFor = (t: Result['type']) =>
    t === 'client'  ? <Building2 size={14}    className="text-cyan-600 dark:text-cyan-300" />
    : t === 'project' ? <FolderKanban size={14} className="text-emerald-600 dark:text-emerald-300" />
    :                   <Users size={14}     className="text-brand-600 dark:text-brand-300" />;

  return (
    <div ref={ref} className="relative hidden lg:block">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search clients, projects, employees…"
        style={{ width: '28rem' }}
        className="!pl-9 !pr-9 py-2 rounded-full bg-slate-100 border-slate-100 text-sm focus:bg-white
                   dark:bg-white/[0.05] dark:border-white/10"
      />
      {query && (
        <button
          onClick={() => { setQuery(''); setOpen(false); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white"
        >
          <X size={14} />
        </button>
      )}

      <AnimatePresence>
        {open && query && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 mt-2 z-50 rounded-2xl bg-white dark:bg-bg-deep border border-slate-200 dark:border-white/10 shadow-xl overflow-hidden"
          >
            <div className="max-h-80 overflow-y-auto py-1">
              {results.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-400">
                  No matches for "<span className="font-medium">{query}</span>"
                </div>
              ) : (
                results.map((r) => (
                  <button
                    key={`${r.type}-${r.id}`}
                    onClick={() => { setOpen(false); setQuery(''); nav(r.to); }}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/[0.05] text-left"
                  >
                    <span className="h-8 w-8 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-white/[0.06] shrink-0">
                      {iconFor(r.type)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{r.label}</div>
                      {r.sub && <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{r.sub}</div>}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400">{r.type}</span>
                  </button>
                ))
              )}
            </div>
            <div className="px-3 py-2 border-t border-slate-100 dark:border-white/10 text-[11px] text-slate-400 flex items-center justify-between">
              <span>{results.length} match{results.length === 1 ? '' : 'es'}</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.06]">Esc</kbd> close</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
