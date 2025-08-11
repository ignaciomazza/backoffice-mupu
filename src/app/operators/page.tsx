// src/app/operators/page.tsx
"use client";
import { useState, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import OperatorForm from "@/components/operators/OperatorForm";
import OperatorList from "@/components/operators/OperatorList";
import { Operator } from "@/types";
import { motion } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import Spinner from "@/components/Spinner";
import "react-toastify/dist/ReactToastify.css";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";

export default function OperatorsPage() {
  const { token } = useAuth();
  const [operators, setOperators] = useState<Operator[]>([]);
  const [agencyId, setAgencyId] = useState<number | null>(null);
  const [expandedOperatorId, setExpandedOperatorId] = useState<number | null>(
    null,
  );

  const [formData, setFormData] = useState<Omit<Operator, "id_operator">>({
    name: "",
    email: "",
    phone: "",
    website: "",
    address: "",
    postal_code: "",
    city: "",
    state: "",
    country: "",
    vat_status: "",
    legal_name: "",
    tax_id: "",
    registration_date: "",
    id_agency: 0, // se inyecta desde el perfil
    credit_balance: 0,
    debit_balance: 0,
  });

  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingOperatorId, setEditingOperatorId] = useState<number | null>(
    null,
  );
  const [loadingOperators, setLoadingOperators] = useState<boolean>(true);

  // 1) Obtener agencyId y pre-llenar formData.id_agency
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await authFetch(
          "/api/user/profile",
          { signal: controller.signal },
          token,
        );
        if (!res.ok) throw new Error("No se pudo obtener el perfil");
        const profile = await res.json();
        setAgencyId(profile.id_agency);
        setFormData((f) => ({ ...f, id_agency: profile.id_agency }));
      } catch (err) {
        if ((err as DOMException)?.name !== "AbortError") {
          console.error("Error fetching profile:", err);
          toast.error("Error al obtener perfil de usuario");
        }
      }
    })();

    return () => controller.abort();
  }, [token]);

  // 2) Cargar operadores filtrados por agencyId
  useEffect(() => {
    if (agencyId === null || !token) return;
    setLoadingOperators(true);
    const controller = new AbortController();

    (async () => {
      try {
        const res = await authFetch(
          `/api/operators?agencyId=${agencyId}`,
          { signal: controller.signal },
          token,
        );
        if (!res.ok) throw new Error("Error al obtener operadores");
        const data: Operator[] = await res.json();
        setOperators(data);
      } catch (error) {
        if ((error as DOMException)?.name !== "AbortError") {
          console.error("Error fetching operators:", error);
          toast.error("Error al obtener operadores");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingOperators(false);
      }
    })();

    return () => controller.abort();
  }, [agencyId, token]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.tax_id) {
      toast.error("Falta completar campos!");
      return;
    }

    const url = editingOperatorId
      ? `/api/operators/${editingOperatorId}`
      : "/api/operators";
    const method = editingOperatorId ? "PUT" : "POST";

    try {
      const res = await authFetch(
        url,
        {
          method,
          body: JSON.stringify(formData),
        },
        token,
      );

      if (!res.ok) {
        let msg = "Error al guardar el operador.";
        try {
          const err = await res.json();
          msg = err?.error || msg;
        } catch {}
        throw new Error(msg);
      }

      const operator: Operator = await res.json();
      setOperators((prev) =>
        editingOperatorId
          ? prev.map((op) =>
              op.id_operator === editingOperatorId ? operator : op,
            )
          : [operator, ...prev],
      );

      toast.success(
        editingOperatorId
          ? "Operador actualizado con éxito!"
          : "Operador creado con éxito!",
      );
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error al guardar el operador:", error.message);
        toast.error(error.message);
      }
    } finally {
      resetForm();
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      website: "",
      address: "",
      postal_code: "",
      city: "",
      state: "",
      country: "",
      vat_status: "",
      legal_name: "",
      tax_id: "",
      registration_date: "",
      id_agency: agencyId!, // mantener agency actual
      credit_balance: 0,
      debit_balance: 0,
    });
    setEditingOperatorId(null);
    setIsFormVisible(false);
  };

  const startEditingOperator = (operator: Operator) => {
    setFormData({
      name: operator.name,
      email: operator.email,
      phone: operator.phone,
      website: operator.website,
      address: operator.address,
      postal_code: operator.postal_code,
      city: operator.city,
      state: operator.state,
      country: operator.country,
      vat_status: operator.vat_status,
      legal_name: operator.legal_name,
      tax_id: operator.tax_id,
      registration_date: operator.registration_date,
      id_agency: operator.id_agency,
      credit_balance: operator.credit_balance || 0,
      debit_balance: operator.debit_balance || 0,
    });
    setEditingOperatorId(operator.id_operator);
    setIsFormVisible(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteOperator = async (id_operator: number) => {
    try {
      const res = await authFetch(
        `/api/operators/${id_operator}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) throw new Error("Error al eliminar el operador.");
      setOperators((prev) =>
        prev.filter((op) => op.id_operator !== id_operator),
      );
      toast.success("Operador eliminado con éxito!");
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error al eliminar el operador:", error.message);
        toast.error("Error al eliminar el operador.");
      }
    }
  };

  return (
    <ProtectedRoute>
      <section className="text-sky-950 dark:text-white">
        <motion.div layout>
          <OperatorForm
            formData={formData}
            handleChange={handleChange}
            handleSubmit={handleSubmit}
            editingOperatorId={editingOperatorId}
            isFormVisible={isFormVisible}
            setIsFormVisible={setIsFormVisible}
          />
        </motion.div>
        <h2 className="my-4 text-2xl font-semibold dark:font-medium">
          Operadores
        </h2>
        {loadingOperators ? (
          <Spinner />
        ) : (
          <OperatorList
            operators={operators}
            expandedOperatorId={expandedOperatorId}
            setExpandedOperatorId={setExpandedOperatorId}
            startEditingOperator={startEditingOperator}
            deleteOperator={deleteOperator}
          />
        )}
        <ToastContainer />
      </section>
    </ProtectedRoute>
  );
}
