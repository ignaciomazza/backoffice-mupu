// src/app/operators/page.tsx

"use client";
import { useState, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import OperatorForm from "@/components/operators/OperatorForm";
import OperatorList from "@/components/operators/OperatorList";
import { Operator } from "@/types";
import { motion } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function OperatorsPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [expandedOperatorId, setExpandedOperatorId] = useState<number | null>(
    null
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
    credit_balance: 0,
    debit_balance: 0,
  });
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingOperatorId, setEditingOperatorId] = useState<number | null>(
    null
  );

  useEffect(() => {
    fetch("/api/operators")
      .then((res) => res.json())
      .then((data) => setOperators(data));
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingOperatorId
      ? `/api/operators/${editingOperatorId}`
      : "/api/operators";
    const method = editingOperatorId ? "PUT" : "POST";

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
        }),
      });

      if (response.ok) {
        const operator = await response.json();
        setOperators((prev) =>
          editingOperatorId
            ? prev.map((op) =>
                op.id_operator === editingOperatorId ? operator : op
              )
            : [...prev, operator]
        );
        toast.success(
          editingOperatorId
            ? "Operador actualizado con éxito!"
            : "Operador creado con éxito!"
        );
      } else {
        throw new Error("Error al guardar el operador.");
      }
    } catch (error) {
      console.error(error);
      toast.error("Error al guardar el operador.");
    }
    resetForm();
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
      credit_balance: 0,
      debit_balance: 0,
    });
    setEditingOperatorId(null);
    setIsFormVisible(false);
  };

  const startEditingOperator = (operator: Operator) => {
    setFormData({
      name: operator.name,
      email: operator.email || "",
      phone: operator.phone || "",
      website: operator.website || "",
      address: operator.address || "",
      postal_code: operator.postal_code || "",
      city: operator.city || "",
      state: operator.state || "",
      country: operator.country || "",
      vat_status: operator.vat_status || "",
      legal_name: operator.legal_name || "",
      tax_id: operator.tax_id || "",
      registration_date: operator.registration_date || "",
      credit_balance: operator.credit_balance || 0,
      debit_balance: operator.debit_balance || 0,
    });
    setEditingOperatorId(operator.id_operator);
    setIsFormVisible(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteOperator = async (id_operator: number) => {
    try {
      const response = await fetch(`/api/operators/${id_operator}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setOperators((prev) =>
          prev.filter((op) => op.id_operator !== id_operator)
        );
        toast.success("Operador eliminado con éxito!");
      } else {
        toast.error("Error al eliminar el operador.");
      }
    } catch (error) {
      console.error("Error al eliminar el operador:", error);
    }
  };

  return (
    <ProtectedRoute>
      <section className="text-black dark:text-white">
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
        <h2 className="text-2xl font-semibold dark:font-medium my-4">Operadores</h2>
        <OperatorList
          operators={operators}
          expandedOperatorId={expandedOperatorId}
          setExpandedOperatorId={setExpandedOperatorId}
          startEditingOperator={startEditingOperator}
          deleteOperator={deleteOperator}
        />
        <ToastContainer />
      </section>
    </ProtectedRoute>
  );
}
