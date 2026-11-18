import { MyBookingsView } from "@/app/(subsystems)/tours/my-bookings/view";

export const metadata = { title: "My bookings" };

/** The bookings list inside the admin shell. /tours/my-bookings sends admins here. */
export default function AdminMyBookingsPage() {
  return <MyBookingsView inAdmin />;
}
