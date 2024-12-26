// src/components/users/UserList.tsx

"use client";
import { User } from "@/types";
import UserCard from "./UserCard";

interface UserListProps {
  users: User[];
  expandedUserId: number | null;
  setExpandedUserId: React.Dispatch<React.SetStateAction<number | null>>;
  startEditingUser: (user: User) => void;
  deleteUser: (id: number) => void;
}

export default function UserList({
  users,
  expandedUserId,
  setExpandedUserId,
  startEditingUser,
  deleteUser,
}: UserListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {users.map((user) => (
        <UserCard
          key={user.id_user}
          user={user}
          expandedUserId={expandedUserId}
          setExpandedUserId={setExpandedUserId}
          startEditingUser={startEditingUser}
          deleteUser={deleteUser}
        />
      ))}
    </div>
  );
}
