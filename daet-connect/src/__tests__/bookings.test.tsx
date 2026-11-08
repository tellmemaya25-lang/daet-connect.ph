import { describe, it, expect } from 'vitest';
import { bookingsData } from '../data/bookings';

describe('Bookings data', () => {
  it('has 27 bookings with correct status distribution', () => {
    const counts = bookingsData.reduce((acc, b) => {
      acc[b.status] = (acc[b.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    expect(bookingsData.length).toBe(27);
    expect(counts['To Confirm']).toBe(10);
    expect(counts['Confirmed']).toBe(8);
    expect(counts['Completed']).toBe(5);
    expect(counts['Declined']).toBe(2);
    expect(counts['Refunded']).toBe(2);
  });

  it('formats peso correctly', () => {
    const price = 14200;
    const formatted = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);
    expect(formatted).toContain('₱');
    expect(formatted).toContain('14,200');
  });

  it('contains required booking fields', () => {
    const b = bookingsData[0];
    expect(b.id).toMatch(/^BK-/);
    expect(b.packageName).toBeTruthy();
    expect(b.guestName).toBeTruthy();
    expect(b.tourDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(b.pax).toBeGreaterThan(0);
  });
});
