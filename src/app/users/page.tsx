// src/app/users/page.tsx

"use client";
import { useState, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import UserForm from "@/components/users/UserForm";
import UserList from "@/components/users/UserList";
import { User } from "@/types";
import { motion } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Omit<User, "id_user">>({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    position: "",
    role: "vendedor", 
    id_agency: 1,
  });
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/users")
      .then((res) => res.json())
      .then((data) => setUsers(data))
      .catch((error) => console.error("Error fetching users:", error));
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({ ...prevData, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const url = editingUserId ? `/api/users/${editingUserId}` : "/api/users";
    const method = editingUserId ? "PUT" : "POST";

    try {
      const data = { ...formData };
      if (editingUserId && !data.password) delete data.password;

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error("Error in request");

      const user = await response.json();

      setUsers((prevUsers) =>
        editingUserId
          ? prevUsers.map((u) => (u.id_user === editingUserId ? user : u))
          : [...prevUsers, user]
      );

      toast.success(
        editingUserId
          ? "Usuario actualizado con éxito!"
          : "Usuario creado con éxito!"
      );

      resetForm();
    } catch (error) {
      console.error("Error en el submit:", error);
      toast.error("Error al guardar el usuario.");
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
          prevUsers.filter((user) => user.id_user !== id_user)
        );
        toast.success("Usuario eliminado con éxito!");
      } else {
        throw new Error("Error eliminando usuario");
      }
    } catch (error) {
      console.error("Error al eliminar el usuario:", error);
      toast.error("Error al eliminar el usuario.");
    }
  };

  return (
    <ProtectedRoute>
      <section className="text-black dark:text-white">
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

        <h2 className="text-2xl font-semibold dark:font-medium my-4">Usuarios</h2>
        <UserList
          users={users}
          expandedUserId={expandedUserId}
          setExpandedUserId={setExpandedUserId}
          startEditingUser={startEditingUser}
          deleteUser={deleteUser}
        />
        <ToastContainer />
      </section>
    </ProtectedRoute>
  );
}
