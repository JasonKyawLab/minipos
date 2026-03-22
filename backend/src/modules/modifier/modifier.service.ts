// =========================================================
// modifier.service.ts
// Path: backend/src/modules/modifier/modifier.service.ts
// =========================================================

import { ShopRepository } from "../shop/shop.repository.js";
import { AuditService } from "../audit/audit.service.js";
import { ModifierRepository } from "./modifier.repository.js";
import {
  CreateModifierGroupInput,
  UpdateModifierGroupInput,
  CreateModifierOptionInput,
  UpdateModifierOptionInput,
} from "./modifier.types.js";

// ── Permission helpers ─────────────────────────────────────
const WRITE_ROLES = ["OWNER", "MANAGER"] as const;
const READ_ROLES  = ["OWNER", "MANAGER", "CASHIER"] as const;

async function assertShopMember(
  shopId: string,
  userId: string,
  allowed: readonly string[]
) {
  const member = await ShopRepository.getUserShopMembership(shopId, userId);

  if (!member || !member.is_active || !allowed.includes(member.role)) {
    throw new Error("FORBIDDEN");
  }
}

export class ModifierService {

  // =======================================================
  // MODIFIER GROUPS
  // =======================================================

  static async createGroup(params: {
    shopId: string;
    requesterId: string;
    input: Omit<CreateModifierGroupInput, "shopId">;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    const group = await ModifierRepository.createGroup({
      ...params.input,
      shopId: params.shopId,
    });

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "MODIFIER_GROUP_CREATED",
      entity:   "MODIFIER_GROUP",
      entityId: group.id,
      metadata: { name: group.name },
    });

    return group;
  }

  static async getGroups(shopId: string, requesterId: string) {
    await assertShopMember(shopId, requesterId, READ_ROLES);
    return ModifierRepository.findAllGroups(shopId);
  }

  static async updateGroup(params: {
    shopId: string;
    groupId: string;
    requesterId: string;
    input: UpdateModifierGroupInput;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    // Validate min_select <= max_select before hitting the DB
    // (DB also has a CHECK constraint but this gives a cleaner error)
    if (
      params.input.min_select !== undefined &&
      params.input.max_select !== undefined &&
      params.input.min_select > params.input.max_select
    ) {
      throw new Error("MIN_EXCEEDS_MAX");
    }

    const updated = await ModifierRepository.updateGroup(
      params.groupId,
      params.shopId,
      params.input
    );

    if (!updated) throw new Error("GROUP_NOT_FOUND");

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "MODIFIER_GROUP_UPDATED",
      entity:   "MODIFIER_GROUP",
      entityId: params.groupId,
      metadata: { updatedFields: Object.keys(params.input) },
    });

    return updated;
  }

  static async deleteGroup(params: {
    shopId: string;
    groupId: string;
    requesterId: string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    const deleted = await ModifierRepository.softDeleteGroup(
      params.groupId,
      params.shopId
    );

    if (!deleted) throw new Error("GROUP_NOT_FOUND");

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "MODIFIER_GROUP_DELETED",
      entity:   "MODIFIER_GROUP",
      entityId: params.groupId,
    });

    return { success: true };
  }

  static async restoreGroup(params: {
    shopId: string;
    groupId: string;
    requesterId: string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    const restored = await ModifierRepository.restoreGroup(
      params.groupId,
      params.shopId
    );

    if (!restored) throw new Error("GROUP_NOT_FOUND");

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "MODIFIER_GROUP_RESTORED",
      entity:   "MODIFIER_GROUP",
      entityId: params.groupId,
    });

    return { success: true };
  }

  // =======================================================
  // MODIFIER OPTIONS
  // =======================================================

  static async createOption(params: {
    shopId: string;
    groupId: string;
    requesterId: string;
    input: Omit<CreateModifierOptionInput, "groupId">;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    // Verify the group belongs to this shop
    const group = await ModifierRepository.findGroupById(
      params.groupId,
      params.shopId
    );
    if (!group) throw new Error("GROUP_NOT_FOUND");

    const option = await ModifierRepository.createOption({
      ...params.input,
      groupId: params.groupId,
    });

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "MODIFIER_OPTION_CREATED",
      entity:   "MODIFIER_OPTION",
      entityId: option.id,
      metadata: { name: option.name, price_delta: option.price_delta },
    });

    return option;
  }

  static async getOptions(params: {
    shopId: string;
    groupId: string;
    requesterId: string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, READ_ROLES);

    const group = await ModifierRepository.findGroupById(
      params.groupId,
      params.shopId
    );
    if (!group) throw new Error("GROUP_NOT_FOUND");

    return ModifierRepository.findOptionsByGroup(params.groupId, params.shopId);
  }

  static async updateOption(params: {
    shopId: string;
    optionId: string;
    requesterId: string;
    input: UpdateModifierOptionInput;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    const updated = await ModifierRepository.updateOption(
      params.optionId,
      params.shopId,
      params.input
    );

    if (!updated) throw new Error("OPTION_NOT_FOUND");

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "MODIFIER_OPTION_UPDATED",
      entity:   "MODIFIER_OPTION",
      entityId: params.optionId,
      metadata: { updatedFields: Object.keys(params.input) },
    });

    return updated;
  }

  static async deleteOption(params: {
    shopId: string;
    optionId: string;
    requesterId: string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    const deleted = await ModifierRepository.deleteOption(
      params.optionId,
      params.shopId
    );

    if (!deleted) throw new Error("OPTION_NOT_FOUND");

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "MODIFIER_OPTION_DELETED",
      entity:   "MODIFIER_OPTION",
      entityId: params.optionId,
    });

    return { success: true };
  }
}