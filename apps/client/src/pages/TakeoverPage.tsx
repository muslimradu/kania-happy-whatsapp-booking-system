import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { formatDateTime, timeUntil } from '@/lib/format';
import type { TakeoverState } from '@/types/api';
import { Spinner, PageHeader } from '@/components/ui/index';

export default function TakeoverPage() {
  const [phone, setPhone]           = useState('');
  const [timeout, setTimeout_]      = useState('30');
  const [status, setStatus]         = useState<TakeoverState | null | 'not-found'>('not-found');
  const [checkLoading, setCheck]    = useState(false);
  const [startLoading, setStart]    = useState(false);
  const [releaseLoading, setRelease]= useState(false);

  async function handleCheck() {
    if (!phone.trim()) return;
    setCheck(true);
    try {
      const data = await api.get<TakeoverState | null>(`/takeover/${encodeURIComponent(phone.trim())}`);
      setStatus(data);
    } catch {
      toast.error('Gagal mengecek status takeover');
    } finally {
      setCheck(false);
    }
  }

  async function handleStart() {
    if (!phone.trim()) return;
    setStart(true);
    try {
      const timeoutNum = parseInt(timeout) || 30;
      const data = await api.post<TakeoverState>(
        `/takeover/${encodeURIComponent(phone.trim())}/start`,
        { timeoutMinutes: timeoutNum },
      );
      setStatus(data);
      toast.success(`Takeover dimulai untuk ${phone}. Bot diam selama ${timeoutNum} menit.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memulai takeover');
    } finally {
      setStart(false);
    }
  }

  async function handleRelease() {
    if (!phone.trim()) return;
    setRelease(true);
    try {
      await api.post(`/takeover/${encodeURIComponent(phone.trim())}/release`);
      setStatus(null);
      toast.success(`Takeover dilepas. Bot aktif kembali untuk ${phone}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal melepas takeover');
    } finally {
      setRelease(false);
    }
  }

  const isActive = status && status !== 'not-found' && status.isTakenOver;
  const isExpired = isActive && new Date(status.expiresAt) < new Date();

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <PageHeader
        title="Human Takeover"
        subtitle="Ambil alih percakapan WhatsApp dari bot untuk nomor tertentu"
      />

      {/* Form cek & start takeover */}
      <div className="card p-6 mb-5">
        <h2 className="font-semibold text-gray-800 mb-4">Cek atau Mulai Takeover</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nomor WhatsApp Customer
            </label>
            <input
              type="text"
              className="input"
              placeholder="628111222333"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCheck()}
            />
            <p className="text-xs text-gray-400 mt-1">Format E.164 tanpa +, contoh: 628111222333</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Durasi Takeover (menit)
            </label>
            <input
              type="number"
              className="input"
              value={timeout}
              onChange={e => setTimeout_(e.target.value)}
              min={1}
              max={1440}
              placeholder="30"
            />
            <p className="text-xs text-gray-400 mt-1">Bot otomatis aktif kembali setelah durasi ini</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              className="btn-secondary"
              onClick={handleCheck}
              disabled={checkLoading || !phone.trim()}
            >
              {checkLoading ? <Spinner size="sm" /> : '🔍'} Cek Status
            </button>
            <button
              className="btn-primary"
              onClick={handleStart}
              disabled={startLoading || !phone.trim()}
            >
              {startLoading ? <Spinner size="sm" /> : '👤'} Mulai Takeover
            </button>
          </div>
        </div>
      </div>

      {/* Status card */}
      {status !== 'not-found' && (
        <div className={`card p-5 ${isActive && !isExpired ? 'border-rose-200 bg-rose-50/40' : 'border-emerald-200 bg-emerald-50/40'}`}>
          {status === null || isExpired ? (
            <div className="flex items-center gap-3">
              <span className="text-2xl">🤖</span>
              <div>
                <p className="font-semibold text-gray-900">Bot Aktif</p>
                <p className="text-sm text-gray-500">
                  {isExpired ? 'Takeover sudah expired — bot sudah aktif kembali.' : 'Tidak ada takeover aktif untuk nomor ini.'}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔴</span>
                  <div>
                    <p className="font-semibold text-gray-900">Takeover Aktif</p>
                    <p className="text-sm text-gray-500">Bot sedang diam untuk nomor ini</p>
                  </div>
                </div>
                <button
                  className="btn-secondary text-xs py-1.5 shrink-0"
                  onClick={handleRelease}
                  disabled={releaseLoading}
                >
                  {releaseLoading ? <Spinner size="sm" /> : '🔓'} Lepas Takeover
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-white/70 px-3 py-2.5">
                  <p className="text-xs text-gray-400 mb-0.5">Nomor</p>
                  <p className="font-mono font-medium text-gray-800">{status.phone}</p>
                </div>
                <div className="rounded-lg bg-white/70 px-3 py-2.5">
                  <p className="text-xs text-gray-400 mb-0.5">Diambil oleh</p>
                  <p className="font-medium text-gray-800">{status.takenOverBy}</p>
                </div>
                <div className="rounded-lg bg-white/70 px-3 py-2.5">
                  <p className="text-xs text-gray-400 mb-0.5">Mulai</p>
                  <p className="font-medium text-gray-800">{formatDateTime(status.startedAt)}</p>
                </div>
                <div className="rounded-lg bg-white/70 px-3 py-2.5">
                  <p className="text-xs text-gray-400 mb-0.5">Berakhir otomatis</p>
                  <p className="font-medium text-gray-800">{formatDateTime(status.expiresAt)}</p>
                  <p className="text-xs text-rose-500 mt-0.5">{timeUntil(status.expiresAt)}</p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Info panel */}
      <div className="mt-5 rounded-xl bg-amber-50 border border-amber-100 p-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">💡 Cara kerja Takeover</p>
        <ul className="space-y-1 text-amber-700 text-xs">
          <li>• Saat takeover aktif, bot tidak akan membalas pesan dari nomor tersebut.</li>
          <li>• Admin bisa chat langsung dengan customer dari nomor WA bisnis.</li>
          <li>• Bot aktif kembali otomatis setelah durasi habis, atau bisa dilepas manual.</li>
          <li>• Jika customer mengirim pesan saat takeover expired, bot langsung aktif kembali.</li>
        </ul>
      </div>
    </div>
  );
}
