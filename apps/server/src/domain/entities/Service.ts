/**
 * Entity: Service (Layanan Senam)
 *
 * Pure domain object — tidak tahu apa-apa tentang Spreadsheet, HTTP, atau
 * library luar. Hanya berisi data & business rule level entitas.
 */
export interface Service {
  serviceId: string;  // contoh: 'SVC001'
  name: string;       // contoh: 'Senam Aerobik'
  price: number;      // dalam Rupiah
  isActive: boolean;
}
