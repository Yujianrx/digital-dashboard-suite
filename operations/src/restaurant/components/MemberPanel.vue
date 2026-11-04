<script setup lang="ts">
import Panel from "./Panel.vue";
import { money, number, percent } from "../format";
import { ratio } from "../model.mjs";
defineProps<{ member: any }>();
</script>
<template>
  <Panel
    title="会员经营与储值"
    eyebrow="MEMBER VALUE"
    :tag="
      member?.unassignedMembers > 0
        ? '未归属门店 ' + number(member.unassignedMembers)
        : '按首次交易门店归属'
    "
  >
    <div class="member-grid">
      <div>
        <span>会员总数（档案ID去重）</span
        ><strong data-testid="member-total">{{ number(member?.total) }}</strong>
      </div>
      <div>
        <span>新增会员档案</span
        ><strong data-testid="member-new">{{
          number(member?.newMembers)
        }}</strong
        ><small class="member-caption"
          >同期新增注册 {{ number(member?.registeredNewMembers) }} 人</small
        >
      </div>
      <div>
        <span>储值消费新 / 老会员（库标签）</span
        ><strong class="member-ratio" data-testid="member-cohorts"
          >{{ percent(ratio(member?.newCustomers, member?.activeCustomers)) }} /
          {{
            percent(ratio(member?.returningCustomers, member?.activeCustomers))
          }}</strong
        ><small class="member-caption"
          >未识别
          {{
            percent(
              ratio(member?.unclassifiedCustomers, member?.activeCustomers),
            )
          }}</small
        >
      </div>
      <div>
        <span>{{ member?.balanceLabel || "当前档案储值余额" }}</span
        ><strong>{{ money(member?.balance, true) }}<small>元</small></strong>
      </div>
      <div>
        <span>余额净消费（含退款）</span
        ><strong
          >{{ money(member?.memberAmount, true) }}<small>元</small></strong
        >
      </div>
      <div>
        <span>当期储值实付</span
        ><strong data-testid="member-recharge"
          >{{ money(member?.recharge, true) }}<small>元</small></strong
        >
      </div>
      <div>
        <span>储值消费会员数（去重）</span
        ><strong>{{ number(member?.activeCustomers) }}</strong
        ><small class="member-caption"
          >消费使用 {{ number(member?.memberVisits) }} 单</small
        >
      </div>
      <div>
        <span>期内储值消费复购率</span
        ><strong class="accent">{{
          percent(ratio(member?.repeatNumerator, member?.repeatDenominator))
        }}</strong
        ><small class="member-caption">至少消费2单的会员占比</small>
      </div>
    </div>
    <p class="micro member-definition" :title="member?.definition">
      {{
        member?.scopeDefinition || "当前范围会员数据待加载"
      }}；消费按实际门店。余额为同步时快照，非历史期末余额。
    </p>
  </Panel>
</template>
