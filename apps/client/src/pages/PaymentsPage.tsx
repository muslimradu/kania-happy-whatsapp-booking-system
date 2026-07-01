import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { formatRupiah, formatDate, formatDateTime } from '@/lib/format';
import type { Payment } from '@/types/api';
import {
  Badge, Spinner, EmptyState, ConfirmModal, PageHeader,
} from '@/components/ui/index';

type Filter = 'pending' | 'all';

function paymentBadge(status: Payment['status']) {
  const map: Record<Payment['status'], { variant: Parameters<typeof Badge>[0]['variant']; label: string }> = {
    'Waiting Verification': { variant: 'pending',  label: 'Menunggu' },
    'Paid':                 { variant: 'paid',     label: 'Lunas' },
    'Rejected':             { variant: 'rejected', label: 'Ditolak' },
    'Cash':                 { variant: 'cash',     label: 'Cash' },
  };
  const v = map[status] ?? { variant: 'inactive', label: status };
  return <Badge variant={v.variant} label={v.label} />;
}

type ModalState =
  | { type: 'approve'; payment: Payment }
  | { type: 'reject';  payment: Payment }
  | null;

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filter, setFilter] = useState<Filter>('pending');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const path = filter === 'pending' ? '/payments/pending' : '/payments';
      const data = await api.get<Payment[]>(path);
      setPayments(data);
    } catch {
      toast.error('Gagal memuat data pembayaran');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void fetchPayments(); }, [fetchPayments]);

  async function handleApprove() {
    if (!modal || modal.type !== 'approve') return;
    setActionLoading(true);
    try {
      await api.post(`/payments/${modal.payment.invoiceNumber}/approve`);
      toast.success(`Pembayaran ${modal.payment.invoiceNumber} disetujui`);
      setModal(null);
      void fetchPayments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyetujui pembayaran');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    if (!modal || modal.type !== 'reject') return;
    setActionLoading(true);
    try {
      await api.post(`/payments/${modal.payment.invoiceNumber}/reject`, {
        reason: rejectReason || undefined,
      });
      toast.success(`Pembayaran ${modal.payment.invoiceNumber} ditolak`);
      setModal(null);
      setRejectReason('');
      void fetchPayments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menolak pembayaran');
    } finally {
      setActionLoading(false);
    }
  }

  const pendingCount = payments.filter(p => p.status === 'Waiting Verification').length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Pembayaran"
        subtitle="Verifikasi pembayaran Transfer & QRIS dari customer"
        action={
          <button onClick={fetchPayments} className="btn-secondary" disabled={loading}>
            {loading ? <Spinner size="sm" /> : '🔄'} Refresh
          </button>
        }
      />

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {([['pending', 'Menunggu Verifikasi'], ['all', 'Semua']] as [Filter, string][]).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === val
                ? 'bg-primary-500 text-white'
                : 'bg-white text-gray-600 border border-surface-border hover:bg-primary-50'
            }`}
          >
            {label}
            {val === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-primary-600 text-xs font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tabel */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : payments.length === 0 ? (
          <EmptyState
            icon="✅"
            title="Tidak ada pembayaran"
            description={filter === 'pending' ? 'Semua pembayaran sudah diverifikasi.' : 'Belum ada data pembayaran.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border bg-gray-50/50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Invoice</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Customer</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Kelas</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Tanggal</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Nominal</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {payments.map(p => (
                  <tr key={p.invoiceNumber} className="hover:bg-primary-50/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-600">{p.invoiceNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{p.customerName || '—'}</p>
                      <p className="text-xs text-gray-400">{p.customerPhone}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{p.serviceName || '—'}</td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700">{formatDate(p.bookingDate)}</p>
                      <p className="text-xs text-gray-400">{p.scheduleTime || ''}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatRupiah(p.amount)}
                    </td>
                    <td className="px-4 py-3 text-center">{paymentBadge(p.status)}</td>
                    <td className="px-4 py-3">
                      {p.status === 'Waiting Verification' ? (
                        <div className="flex gap-2 justify-center">
                          <button
                            className="btn-primary py-1 px-3 text-xs"
                            onClick={() => setModal({ type: 'approve', payment: p })}
                          >
                            ✓ Setujui
                          </button>
                          <button
                            className="btn-danger py-1 px-3 text-xs"
                            onClick={() => { setRejectReason(''); setModal({ type: 'reject', payment: p }); }}
                          >
                            ✗ Tolak
                          </button>
                        </div>
                      ) : (
                        <div className="text-center">
                          {p.verifiedBy ? (
                            <span className="text-xs text-gray-400">
                              oleh {p.verifiedBy}<br />
                              {formatDateTime(p.verifiedAt)}
                            </span>
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Approve */}
      <ConfirmModal
        open={modal?.type === 'approve'}
        title="Setujui Pembayaran?"
        description={
          modal?.type === 'approve'
            ? <>Booking <strong>{modal.payment.invoiceNumber}</strong> — {modal.payment.customerName} akan diubah ke status <strong>Confirmed</strong>. Notifikasi WA akan dikirim otomatis.</>
            : undefined
        }
        confirmLabel="Setujui"
        confirmVariant="primary"
        onConfirm={handleApprove}
        onCancel={() => setModal(null)}
        loading={actionLoading}
      />

      {/* Modal Reject */}
      {modal?.type === 'reject' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="relative card p-6 w-full max-w-sm shadow-lg">
            <h3 className="font-semibold text-gray-900 mb-1">Tolak Pembayaran?</h3>
            <p className="text-sm text-gray-500 mb-4">
              Invoice <strong>{modal.payment.invoiceNumber}</strong> akan ditolak. Booking akan dibatalkan dan notifikasi WA dikirim ke customer.
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Alasan penolakan <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <textarea
              className="input resize-none mb-4"
              rows={3}
              placeholder="Contoh: Bukti transfer tidak terbaca"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
            <div className="flex gap-3 justify-end">
              <button className="btn-secondary" onClick={() => setModal(null)} disabled={actionLoading}>Batal</button>
              <button className="btn-danger" onClick={handleReject} disabled={actionLoading}>
                {actionLoading ? <Spinner size="sm" /> : null} Tolak
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
