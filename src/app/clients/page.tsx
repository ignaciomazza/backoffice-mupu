// src/app/clients/page.tsx

"use client";
import { useState, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Client } from "@/types";
import { motion } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import ClientForm from "@/components/clients/ClientForm";
import ClientList from "@/components/clients/ClientList";
import Spinner from "@/components/Spinner";
import "react-toastify/dist/ReactToastify.css";

export default function Page() {
  const [clients, setClients] = useState<Client[]>([]);
  const [expandedClientId, setExpandedClientId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [formData, setFormData] = useState<
    Omit<Client, "id_client" | "registration_date">
  >({
    first_name: "",
    last_name: "",
    phone: "",
    address: "",
    postal_code: "",
    locality: "",
    company_name: "",
    tax_id: "",
    commercial_address: "",
    dni_number: "",
    passport_number: "",
    birth_date: "",
    nationality: "",
    gender: "",
    email: "",
  });
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);

  useEffect(() => {
    const fetchClients = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/clients");
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Error al obtener clientes");
        }
        const data = await response.json();
        setClients(data);
      } catch (error) {
        console.error("Error fetching clients:", error);
        toast.error("Error al obtener clientes.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchClients();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({ ...prevData, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !(formData.dni_number || "").trim() &&
      !(formData.passport_number || "").trim()
    ) {
      toast.error(
        "El DNI y el Pasaporte son obigatorios. Debes cargar al menos uno",
      );
      return;
    }

    try {
      const url = editingClientId
        ? `/api/clients/${editingClientId}`
        : "/api/clients";
      const method = editingClientId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          birth_date: formData.birth_date
            ? new Date(formData.birth_date).toISOString()
            : null,
        }),
      });

      if (response.ok) {
        const newClient = await response.json();
        setClients((prevClients) =>
          editingClientId
            ? prevClients.map((client) =>
                client.id_client === editingClientId ? newClient : client,
              )
            : [...prevClients, newClient],
        );
        toast.success("Cliente guardado con éxito!");
      } else {
        const errorData = await response.json();
        toast.error(
          errorData.error || "Error al guardar el cliente. Intente nuevamente.",
        );
      }
    } catch (error) {
      console.error("Error al guardar el cliente:", error);
      toast.error("Error al guardar el cliente. Intente nuevamente.");
    }

    setFormData({
      first_name: "",
      last_name: "",
      phone: "",
      address: "",
      postal_code: "",
      locality: "",
      company_name: "",
      tax_id: "",
      commercial_address: "",
      dni_number: "",
      passport_number: "",
      birth_date: "",
      nationality: "",
      gender: "",
      email: "",
    });
    setIsFormVisible(false);
    setEditingClientId(null);
  };

  const deleteClient = async (id: number) => {
    try {
      const response = await fetch(`/api/clients/${id}`, { method: "DELETE" });
      if (response.ok) {
        setClients((prevClients) =>
          prevClients.filter((client) => client.id_client !== id),
        );
        toast.success("Cliente eliminado con éxito!");
      } else {
        const errorData = await response.json();
        toast.error(
          errorData.error ||
            "Error al eliminar el cliente. Intente nuevamente.",
        );
      }
    } catch (error) {
      console.error("Error al eliminar el cliente:", error);
      toast.error("Error al eliminar el cliente. Intente nuevamente.");
    }
  };

  const startEditingClient = (client: Client) => {
    setFormData({
      first_name: client.first_name,
      last_name: client.last_name,
      phone: client.phone || "",
      address: client.address || "",
      postal_code: client.postal_code || "",
      locality: client.locality || "",
      company_name: client.company_name || "",
      tax_id: client.tax_id || "",
      commercial_address: client.commercial_address || "",
      dni_number: client.dni_number || "",
      passport_number: client.passport_number || "",
      birth_date: client.birth_date
        ? new Date(client.birth_date).toISOString().split("T")[0]
        : "",
      nationality: client.nationality || "",
      gender: client.gender || "",
      email: client.email || "",
    });
    setEditingClientId(client.id_client);
    setIsFormVisible(true);
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("es-AR", { timeZone: "UTC" });
  };

  return (
    <ProtectedRoute>
      <section className="text-black dark:text-white">
        <motion.div layout>
          <ClientForm
            formData={formData}
            handleChange={handleChange}
            handleSubmit={handleSubmit}
            editingClientId={editingClientId}
            isFormVisible={isFormVisible}
            setIsFormVisible={setIsFormVisible}
          />
        </motion.div>
        <h2 className="my-4 text-2xl font-semibold dark:font-medium">
          Clientes
        </h2>
        {isLoading ? (
          <div className="flex min-h-[50vh] items-center">
            <Spinner />
          </div>
        ) : (
          <ClientList
            clients={clients}
            expandedClientId={expandedClientId}
            setExpandedClientId={setExpandedClientId}
            formatDate={formatDate}
            startEditingClient={startEditingClient}
            deleteClient={deleteClient}
          />
        )}
        <ToastContainer />
      </section>
    </ProtectedRoute>
  );
}
