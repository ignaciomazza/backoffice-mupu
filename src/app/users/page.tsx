// src/app/users/page.tsx
"use client";

import { useState, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import UserForm from "@/components/users/UserForm";
import UserList from "@/components/users/UserList";
import { User } from "@/types";
import { motion } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import Spinner from "@/components/Spinner";
import "react-toastify/dist/ReactToastify.css";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";

type UserFormData = {
  email: string;
  password?: string;
  first_name: string;
  last_name: string;
  position: string;
  role: string;
  id_agency: number;
};

export default function UsersPage() {
  const { token } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [formData, setFormData] = useState<UserFormData>({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    position: "",
    role: "vendedor",
    id_agency: 1,
  });
  const [isFormVisible, setIsFormVisible] = useState<boolean>(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(true);

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();
    const load = async () => {
      try {
        setLoadingUsers(true);
        const res = await authFetch(
          "/api/users",
          { signal: controller.signal },
          token,
        );
        if (!res.ok) {
          throw new Error("Error al obtener usuarios");
        }
        const data: User[] = await res.json();
        setUsers(data);
      } catch (error: unknown) {
        if ((error as DOMException)?.name === "AbortError") return;
        console.error("Error fetching users:", error);
        toast.error("Error al obtener usuarios");
      } finally {
        if (!controller.signal.aborted) setLoadingUsers(false);
      }
    };
    load();

    return () => controller.abort();
  }, [token]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({ ...prevData, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.email ||
      !formData.first_name ||
      !formData.last_name ||
      !formData.position ||
      !formData.role
    ) {
      toast.error("Todos los campos obligatorios deben ser completados.");
      return;
    }

    const url = editingUserId ? `/api/users/${editingUserId}` : "/api/users";
    const method = editingUserId ? "PUT" : "POST";

    try {
      const dataToSend: UserFormData = { ...formData };
      // Si estamos editando y no cambiaron contraseña, no la enviamos
      if (editingUserId && !dataToSend.password) {
        delete (dataToSend as Partial<UserFormData>).password;
      }

      const response = await authFetch(
        url,
        {
          method,
          body: JSON.stringify(dataToSend),
        },
        token,
      );

      if (!response.ok) {
        let message = "Error en la solicitud";
        try {
          const errorResponse = await response.json();
          message = errorResponse.error || errorResponse.message || message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      const user: User = await response.json();
      setUsers((prevUsers) =>
        editingUserId
          ? prevUsers.map((u) => (u.id_user === editingUserId ? user : u))
          : [...prevUsers, user],
      );
      toast.success(
        editingUserId
          ? "Usuario actualizado con éxito!"
          : "Usuario creado con éxito!",
      );
      resetForm();
    } catch (error: unknown) {
      const err = error as Error;
      console.error("Error en el submit:", err.message || err);
      toast.error(err.message || "Error al guardar el usuario.");
    }
  };

  const resetForm = () => {
    setFormData({
      email: "",
      password: "",
      first_name: "",
      last_name: "",
      position: "",
      role: "vendedor",
      id_agency: 1,
    });
    setEditingUserId(null);
    setIsFormVisible(false);
  };

  const startEditingUser = (user: User) => {
    setFormData({
      email: user.email,
      password: "",
      first_name: user.first_name,
      last_name: user.last_name,
      position: user.position,
      role: user.role,
      id_agency: user.id_agency,
    });
    setEditingUserId(user.id_user);
    setIsFormVisible(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteUser = async (id_user: number) => {
    try {
      const response = await authFetch(
        `/api/users/${id_user}`,
        { method: "DELETE" },
        token,
      );
      if (!response.ok) {
        throw new Error("Error al eliminar el usuario");
      }
      setUsers((prevUsers) =>
        prevUsers.filter((user) => user.id_user !== id_user),
      );
      toast.success("Usuario eliminado con éxito!");
    } catch (error: unknown) {
      console.error("Error al eliminar el usuario:", error);
      toast.error("Error al eliminar el usuario.");
    }
  };

  return (
    <ProtectedRoute>
      <section className="text-sky-950 dark:text-white">
        <motion.div layout>
          <UserForm
            formData={formData}
            handleChange={handleChange}
            handleSubmit={handleSubmit}
            editingUserId={editingUserId}
            isFormVisible={isFormVisible}
            setIsFormVisible={setIsFormVisible}
          />
        </motion.div>

        <h2 className="my-4 text-2xl font-semibold dark:font-medium">
          Usuarios
        </h2>
        {loadingUsers ? (
          <Spinner />
        ) : (
          <UserList
            users={users}
            startEditingUser={startEditingUser}
            deleteUser={deleteUser}
          />
        )}
        <ToastContainer />
      </section>
    </ProtectedRoute>
  );
}
