// src/app/bookings/page.tsx

"use client";
import { useState, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import BookingForm from "@/components/bookings/BookingForm";
import BookingList from "@/components/bookings/BookingList";
import Spinner from "@/components/Spinner";
import { motion } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Booking } from "@/types";
import { useAuth } from "@/context/AuthContext";

type BookingFormData = {
  id_booking?: number;
  status: string;
  details?: string;
  titular_id: number;
  id_user: number;
  id_agency: number;
  departure_date: string;
  return_date: string;
  observation?: string;
  pax_count: number;
  clients_ids: number[];
};

export default function Page() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [expandedBookingId, setExpandedBookingId] = useState<number | null>(
    null,
  );
  const [formData, setFormData] = useState<BookingFormData>({
    id_booking: undefined,
    status: "Pendiente",
    details: "",
    titular_id: 0,
    id_user: 0,
    id_agency: 1,
    departure_date: "",
    return_date: "",
    observation: "",
    pax_count: 1,
    clients_ids: [],
  });
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingBookingId, setEditingBookingId] = useState<number | null>(null);
  const [loadingBookings, setLoadingBookings] = useState<boolean>(true);
  const { token } = useAuth();

  // Cargar el perfil del usuario para obtener su id
  useEffect(() => {
    if (!token) return;
    fetch("/api/user/profile", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then((profile) => {
        setFormData((prevData) => ({
          ...prevData,
          id_user: profile.id_user,
        }));
      })
      .catch((err: unknown) => {
        if (err instanceof Error) {
          console.error("Error fetching profile:", err.message);
        }
      });
  }, [token]);

  // Cargar las reservas
  useEffect(() => {
    setLoadingBookings(true);
    fetch("/api/bookings")
      .then((res) => res.json())
      .then((data) => {
        setBookings(data);
        setLoadingBookings(false);
      })
      .catch((error: unknown) => {
        if (error instanceof Error) {
          console.error("Error fetching bookings:", error.message);
        }
        setLoadingBookings(false);
      });
  }, []);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: ["pax_count", "titular_id"].includes(name)
        ? Number(value)
        : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.status ||
      formData.titular_id === 0 ||
      !formData.departure_date ||
      !formData.return_date
    ) {
      toast.error("Completa los campos obligatorios.");
      return;
    }

    if (formData.clients_ids.includes(formData.titular_id)) {
      toast.error("El titular no puede estar de acompañante.");
      return;
    }

    try {
      const url = editingBookingId
        ? `/api/bookings/${editingBookingId}`
        : "/api/bookings";
      const method = editingBookingId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorResponse = await response.json();
        throw new Error(errorResponse.error || "Error al guardar la reserva.");
      }

      // Actualizar la lista de reservas
      fetch("/api/bookings")
        .then((res) => res.json())
        .then((data) => setBookings(data));
      toast.success("Reserva guardada con éxito!");
      resetForm();
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
        toast.error(error.message || "Error inesperado.");
      }
    }
  };

  const resetForm = () => {
    setFormData({
      id_booking: undefined,
      status: "Pendiente",
      details: "",
      titular_id: 0,
      id_user: formData.id_user,
      id_agency: 1,
      departure_date: "",
      return_date: "",
      observation: "",
      pax_count: 1,
      clients_ids: [],
    });
    setIsFormVisible(false);
    setEditingBookingId(null);
  };

  const startEditingBooking = (booking: Booking) => {
    setFormData({
      id_booking: booking.id_booking,
      status: booking.status,
      details: booking.details || "",
      titular_id: booking.titular?.id_client || 0,
      id_user: booking.user?.id_user || 0,
      id_agency: booking.agency?.id_agency || 0,
      departure_date: booking.departure_date.split("T")[0],
      return_date: booking.return_date.split("T")[0],
      observation: booking.observation || "",
      pax_count: booking.pax_count || 1,
      clients_ids: booking.clients?.map((client) => client.id_client) || [],
    });
    setEditingBookingId(booking.id_booking || null);
    setIsFormVisible(true);
  };

  const deleteBooking = async (id: number) => {
    try {
      const response = await fetch(`/api/bookings/${id}`, { method: "DELETE" });

      if (response.ok) {
        setBookings((prevBookings) =>
          prevBookings.filter((booking) => booking.id_booking !== id),
        );
        toast.success("Reserva eliminada con éxito!");
      } else {
        throw new Error("Error al eliminar la reserva.");
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error("Error al eliminar la reserva:", error.message);
        toast.error("Error al eliminar la reserva.");
      }
    }
  };

  return (
    <ProtectedRoute>
      <section className="text-black dark:text-white">
        <motion.div layout>
          <BookingForm
            formData={formData}
            handleChange={handleChange}
            handleSubmit={handleSubmit}
            editingBookingId={editingBookingId}
            isFormVisible={isFormVisible}
            setFormData={setFormData}
            setIsFormVisible={setIsFormVisible}
          />
        </motion.div>
        <h2 className="my-4 text-2xl font-semibold dark:font-medium">
          Reservas
        </h2>
        {loadingBookings ? (
          <div className="flex min-h-[50vh] items-center">
            <Spinner />
          </div>
        ) : (
          <BookingList
            bookings={bookings}
            expandedBookingId={expandedBookingId}
            setExpandedBookingId={setExpandedBookingId}
            startEditingBooking={startEditingBooking}
            deleteBooking={deleteBooking}
          />
        )}
        <ToastContainer />
      </section>
    </ProtectedRoute>
  );
}
