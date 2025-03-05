// src/components/operators/OperatorList.tsx

"use client";
import { Operator } from "@/types"; // Actualiza este import si tienes un tipo definido para Operator
import OperatorCard from "./OperatorCard";

interface OperatorListProps {
  operators: Operator[];
  expandedOperatorId: number | null;
  setExpandedOperatorId: React.Dispatch<React.SetStateAction<number | null>>;
  startEditingOperator: (operator: Operator) => void;
  deleteOperator: (id: number) => void;
}

export default function OperatorList({
  operators,
  expandedOperatorId,
  setExpandedOperatorId,
  startEditingOperator,
  deleteOperator,
}: OperatorListProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {operators.map((operator) => (
        <OperatorCard
          key={operator.id_operator}
          operator={operator}
          expandedOperatorId={expandedOperatorId}
          setExpandedOperatorId={setExpandedOperatorId}
          startEditingOperator={startEditingOperator}
          deleteOperator={deleteOperator}
        />
      ))}
    </div>
  );
}
