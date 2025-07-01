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
    setLoadingUsers(true);
    fetch("/api/users")
      .then((res) => {
        if (!res.ok) {
          throw new Error("Error al obtener usuarios");
        }
        return res.json();
      })
      .then((data) => {
        setUsers(data);
        setLoadingUsers(false);
      })
      .catch((error: unknown) => {
        console.error("Error fetching users:", error);
        toast.error("Error al obtener usuarios");
        setLoadingUsers(false);
      });
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
      const dataToSend = { ...formData };
      if (editingUserId && !dataToSend.password) {
        delete dataToSend.password;
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataToSend),
      });

      if (!response.ok) {
        const errorResponse = await response.json();
        throw new Error(errorResponse.error || "Error en la solicitud");
      }

      const user = await response.json();
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
      const response = await fetch(`/api/users/${id_user}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setUsers((prevUsers) =>
          prevUsers.filter((user) => user.id_user !== id_user),
        );
        toast.success("Usuario eliminado con éxito!");
      } else {
        throw new Error("Error al eliminar el usuario");
      }
    } catch (error) {
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
