import Role from "../models/Role.js";

export const getRoleByName = async (roleName) => {
  if (typeof roleName !== "string" || !roleName.trim()) {
    throw new Error("Valid role name is required");
  }

  const role = await Role.findOne({
    role_name: roleName.trim().toUpperCase(),
  });

  if (!role) {
    throw new Error(`${roleName} role not found`);
  }

  return role;
};