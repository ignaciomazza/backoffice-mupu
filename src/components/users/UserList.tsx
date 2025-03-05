// src/components/users/UserList.tsx

"use client";
import { User } from "@/types";
import UserCard from "./UserCard";

interface UserListProps {
  users: User[];
  startEditingUser: (user: User) => void;
  deleteUser: (id: number) => void;
}

export default function UserList({
  users,
  startEditingUser,
  deleteUser,
}: UserListProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {users.map((user) => (
        <UserCard
          key={user.id_user}
          user={user}
          startEditingUser={startEditingUser}
          deleteUser={deleteUser}
        />
      ))}
    </div>
  );
}
