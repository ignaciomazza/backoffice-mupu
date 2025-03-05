// src/components/bookings/BookingForm.tsx

import { ChangeEvent, FormEvent } from "react";
import { motion } from "framer-motion";

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

type BookingFormProps = {
  formData: BookingFormData;
  handleChange: (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => void;
  handleSubmit: (e: FormEvent) => Promise<void>;
  editingBookingId: number | null;
  isFormVisible: boolean;
  setFormData: React.Dispatch<React.SetStateAction<BookingFormData>>;
  setIsFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function BookingForm({
  formData,
  handleChange,
  handleSubmit,
  editingBookingId,
  setFormData,
  isFormVisible,
  setIsFormVisible,
}: BookingFormProps) {
  const handleAcompananteChange = (index: number, value: string) => {
    const newId = Number(value);
    if (newId === formData.titular_id) {
      alert("El titular no puede ser incluido como acompañante.");
      return;
    }
    setFormData((prevData) => {
      const newClientsIds = [...prevData.clients_ids];
      newClientsIds[index] = newId;
      return { ...prevData, clients_ids: newClientsIds };
    });
  };

  return (
    <motion.div
      layout
      initial={{ maxHeight: 80, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 700 : 80,
        opacity: 1,
        transition: { duration: 0.4, ease: "easeInOut" },
      }}
      className="mb-6 space-y-3 overflow-hidden rounded-3xl bg-white p-6 text-black shadow-md dark:border dark:border-white dark:bg-black"
    >
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setIsFormVisible(!isFormVisible)}
      >
        <p className="text-lg font-medium dark:text-white">
          {editingBookingId ? "Editar Reserva" : "Agregar Reserva"}
        </p>
        <button className="rounded-full bg-black p-2 text-white dark:bg-white dark:text-black">
          {isFormVisible ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
          )}
        </button>
      </div>
      {isFormVisible && (
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onSubmit={handleSubmit}
          className="max-h-[600px] space-y-3 overflow-y-auto pr-12"
        >
          <div>
            <label className="ml-2 block text-sm font-medium dark:text-white">
              Detalle
            </label>
            <input
              type="text"
              name="details"
              value={formData.details || ""}
              onChange={handleChange}
              className="w-full rounded-2xl border border-black p-2 outline-none dark:border-white"
            />
          </div>

          <div>
            <label className="ml-2 block text-sm font-medium dark:text-white">
              Desde
            </label>
            <input
              type="date"
              name="departure_date"
              value={formData.departure_date || ""}
              onChange={handleChange}
              className="w-full rounded-2xl border border-black p-2 outline-none dark:border-white"
            />
          </div>

          <div>
            <label className="ml-2 block text-sm font-medium dark:text-white">
              Hasta
            </label>
            <input
              type="date"
              name="return_date"
              value={formData.return_date || ""}
              onChange={handleChange}
              className="w-full rounded-2xl border border-black p-2 outline-none dark:border-white"
            />
          </div>

          <div>
            <label className="ml-2 block text-sm font-medium dark:text-white">
              ID del Titular
            </label>
            <input
              type="number"
              name="titular_id"
              value={formData.titular_id || ""}
              onChange={(e) => {
                const titularId = Number(e.target.value);
                setFormData((prevData) => ({
                  ...prevData,
                  titular_id: titularId,
                  clients_ids: prevData.clients_ids.filter(
                    (id) => id !== titularId,
                  ),
                }));
              }}
              onKeyDown={(e) => {
                if (["ArrowUp", "ArrowDown"].includes(e.key))
                  e.preventDefault();
              }}
              className="w-full rounded-2xl border border-black p-2 outline-none dark:border-white"
              min={1}
            />
          </div>

          <div>
            <label className="ml-2 block text-sm font-medium dark:text-white">
              Cantidad de Acompañantes
            </label>
            <input
              type="number"
              name="pax_count"
              value={formData.pax_count - 1} // Excluir al titular
              onChange={(e) => {
                const newPaxCount = Number(e.target.value) + 1; // Incluir al titular
                setFormData((prevData) => ({
                  ...prevData,
                  pax_count: newPaxCount,
                  clients_ids: Array(newPaxCount - 1).fill(""),
                }));
              }}
              min={0}
              onKeyDown={(e) => {
                if (["ArrowUp", "ArrowDown"].includes(e.key))
                  e.preventDefault();
              }}
              className="w-full rounded-2xl border border-black p-2 outline-none dark:border-white"
            />
          </div>

          <div>
            <label className="ml-2 block text-sm font-medium dark:text-white">
              IDs de Acompañantes
            </label>
            {Array.from({ length: formData.pax_count - 1 }).map((_, index) => (
              <input
                key={index}
                type="number"
                value={formData.clients_ids[index] || ""}
                onChange={(e) => handleAcompananteChange(index, e.target.value)}
                className="mb-2 w-full appearance-none rounded-md border p-2"
                placeholder={`ID del acompañante ${index + 1}`}
                onKeyDown={(e) => {
                  if (["ArrowUp", "ArrowDown"].includes(e.key))
                    e.preventDefault();
                }}
              />
            ))}
          </div>

          <button
            type="submit"
            className="block rounded-full bg-black px-6 py-2 text-white transition-transform dark:bg-white dark:text-black"
          >
            {editingBookingId ? "Guardar Cambios" : "Agregar Reserva"}
          </button>
        </motion.form>
      )}
    </motion.div>
  );
}
