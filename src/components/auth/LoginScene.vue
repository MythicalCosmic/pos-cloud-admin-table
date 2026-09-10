<script setup lang="ts">
import DesignIcon from '@/components/design/DesignIcon.vue'

defineProps<{ paused: boolean }>()

const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <div
    class="login-scene"
    :class="{ 'is-paused': paused }"
    aria-hidden="true"
  >
    <div class="login-scene__orbit login-scene__orbit--outer" />
    <div class="login-scene__orbit login-scene__orbit--inner" />
    <div class="login-scene__spark login-scene__spark--one">
      ✳
    </div>
    <div class="login-scene__spark login-scene__spark--two">
      ✳
    </div>

    <div class="login-scene__table-float">
      <div class="login-scene__table">
        <div class="login-scene__napkin" />
        <svg
          class="login-scene__cutlery login-scene__cutlery--fork"
          viewBox="0 0 24 150"
          fill="none"
        >
          <path
            d="M4 3v30c0 13 16 13 16 0V3M12 3v140"
            stroke="currentColor"
            stroke-width="5"
            stroke-linecap="round"
          />
        </svg>
        <div class="login-scene__plate">
          <div class="login-scene__plate-rim">
            <div class="login-scene__plate-center">
              <svg
                class="login-scene__flower"
                viewBox="0 0 100 100"
                fill="none"
              >
                <path
                  d="M50 50C-5 35 24-5 50 50C65-5 105 24 50 50C105 65 76 105 50 50C35 105-5 76 50 50Z"
                  fill="currentColor"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="8"
                  fill="#ebefcb"
                />
              </svg>
            </div>
          </div>
        </div>
        <svg
          class="login-scene__cutlery login-scene__cutlery--knife"
          viewBox="0 0 24 150"
          fill="none"
        >
          <path
            d="M17 4C5 16 5 38 5 65h12M17 4v139"
            stroke="currentColor"
            stroke-width="5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <div class="login-scene__coaster">
          <div class="login-scene__glass" />
        </div>
      </div>
    </div>

    <div class="login-scene__tag login-scene__tag--orders">
      <span class="login-scene__tag-icon"><DesignIcon
        name="receipt"
        :size="19"
      /></span>
      <span>{{ t('login_scene_orders') }}</span>
      <DesignIcon
        name="check"
        :size="15"
        class="login-scene__tag-check"
      />
    </div>
    <div class="login-scene__tag login-scene__tag--team">
      <span class="login-scene__tag-icon"><DesignIcon
        name="users"
        :size="19"
      /></span>
      <span>{{ t('login_scene_team') }}</span>
    </div>
    <div class="login-scene__tag login-scene__tag--overview">
      <span class="login-scene__tag-icon"><DesignIcon
        name="chart"
        :size="19"
      /></span>
      <span>{{ t('login_scene_overview') }}</span>
      <span class="login-scene__mini-bars"><i /><i /><i /><i /></span>
    </div>
  </div>
</template>

<style scoped>
.login-scene {
  position: relative;
  flex: 1 0 310px;
  inline-size: 100%;
  isolation: isolate;
  margin-block: 8px 0;
  margin-inline: auto;
  max-inline-size: 590px;
  min-block-size: 310px;
}

.login-scene__orbit {
  position: absolute;
  z-index: -1;
  border: 1px solid rgb(214 235 211 / 11%);
  border-radius: 50%;
  transform: rotate(-24deg);
}

.login-scene__orbit--outer {
  inset-block: 5% 2%;
  inset-inline: -7%;
}

.login-scene__orbit--inner {
  border-style: dashed;
  border-color: rgb(214 235 211 / 15%);
  inset-block: 17% 15%;
  inset-inline: 3%;
}

.login-scene__table-float {
  position: absolute;
  display: grid;
  animation: scene-float 7s ease-in-out infinite;
  inset-block: 4% 8%;
  inset-inline: 16%;
  perspective: 950px;
  place-items: center;
}

.login-scene__table {
  position: relative;
  border: 1px solid #8b9d7d;
  border-radius: 36px;
  background: linear-gradient(145deg, #c8d3b6, #92a87d);
  block-size: 290px;
  box-shadow:
    -1px 1px 0 #738666,
    -3px 3px 0 #738666,
    -5px 5px 0 #64785c,
    -7px 7px 0 #64785c,
    -18px 28px 30px rgb(0 0 0 / 22%);
  inline-size: 290px;
  transform: rotateX(46deg) rotateZ(-29deg);
}

.login-scene__napkin {
  position: absolute;
  border: 1px solid #dedbc8;
  border-radius: 3px;
  background: repeating-linear-gradient(90deg, #e5e2d2 0 2px, #efecdf 2px 4px);
  box-shadow: 0 3px 4px rgb(41 57 33 / 14%);
  inset-block: 56px 36px;
  inset-inline: 45px 72px;
  transform: rotate(-8deg);
}

.login-scene__plate {
  position: absolute;
  display: grid;
  padding: 14px;
  border: 1px solid #fffff8;
  border-radius: 50%;
  background: linear-gradient(145deg, #fffff6, #e7e6d8);
  box-shadow: -1px 2px 0 #cecfbd, -3px 5px 0 #d8d9c8, -8px 14px 12px rgb(42 54 28 / 24%);
  inset: 51px;
}

.login-scene__plate-rim {
  display: grid;
  padding: 14px;
  border: 1px solid #dddecd;
  border-radius: 50%;
  box-shadow: inset 2px 3px 5px rgb(90 100 59 / 10%), 0 1px 1px #fff;
}

.login-scene__plate-center {
  display: grid;
  border-radius: 50%;
  background: #f4f4e8;
  place-items: center;
}

.login-scene__flower {
  color: #486444;
  inline-size: 86px;
  transform: rotate(10deg);
}

.login-scene__cutlery {
  position: absolute;
  block-size: 139px;
  color: #f7f5e9;
  filter: drop-shadow(-3px 4px 1px rgb(61 76 46 / 28%));
  inline-size: 20px;
  inset-block-start: 88px;
}

.login-scene__cutlery--fork {
  inset-inline-start: 20px;
}

.login-scene__cutlery--knife {
  inset-inline-end: 23px;
}

.login-scene__coaster {
  position: absolute;
  display: grid;
  border-radius: 50%;
  background: #80936c;
  block-size: 54px;
  box-shadow: -1px 2px 0 #728461;
  inline-size: 54px;
  inset-block-start: 15px;
  inset-inline-end: 20px;
  place-items: center;
}

.login-scene__glass {
  border: 3px solid rgb(255 255 255 / 60%);
  border-radius: 50%;
  background: linear-gradient(135deg, rgb(238 245 219 / 50%), rgb(245 252 241 / 8%));
  block-size: 40px;
  box-shadow: inset 3px 3px 0 rgb(255 255 255 / 14%), -4px 6px 5px rgb(49 73 42 / 20%);
  inline-size: 40px;
}

.login-scene__tag {
  position: absolute;
  display: flex;
  align-items: center;
  border-radius: 14px;
  animation: scene-tag-float 7s ease-in-out infinite;
  background: #f5f4e9;
  box-shadow: 0 0 0 1px rgb(255 255 255 / 25%), 0 8px 28px rgb(0 0 0 / 16%);
  color: #243e30;
  font-size: 13px;
  font-weight: 600;
  gap: 11px;
  padding-block: 10px;
  padding-inline: 10px 14px;
  white-space: nowrap;
}

.login-scene__tag--orders {
  animation-delay: -2s;
  inset-block-start: 4%;
  inset-inline-start: 2%;
}

.login-scene__tag--team {
  animation-delay: -4s;
  inset-block-start: 40%;
  inset-inline-end: -1%;
}

.login-scene__tag--overview {
  animation-delay: -1s;
  inset-block-end: 1%;
  inset-inline-start: 13%;
}

.login-scene__tag-icon {
  display: grid;
  border-radius: 9px;
  background: #e3e9d7;
  block-size: 32px;
  inline-size: 32px;
  place-items: center;
}

.login-scene__tag-check {
  color: #4b7046;
  margin-inline-start: 9px;
}

.login-scene__mini-bars {
  display: flex;
  align-items: flex-end;
  block-size: 22px;
  gap: 3px;
  margin-inline-start: 8px;
}

.login-scene__mini-bars i {
  border-radius: 2px;
  background: #78915d;
  block-size: 9px;
  inline-size: 4px;
}

.login-scene__mini-bars i:nth-child(2) {
  block-size: 15px;
}

.login-scene__mini-bars i:nth-child(3) {
  block-size: 12px;
}

.login-scene__mini-bars i:nth-child(4) {
  block-size: 21px;
}

.login-scene__spark {
  position: absolute;
  color: #c5d5a7;
  font-size: 28px;
  line-height: 1;
}

.login-scene__spark--one {
  font-size: 21px;
  inset-block-start: 6%;
  inset-inline-end: 21%;
}

.login-scene__spark--two {
  inset-block-end: 19%;
  inset-inline-start: 4%;
}

.is-paused *,
.is-paused *::before {
  animation-play-state: paused;
}

@keyframes scene-float {
  0%,
  100% {
    transform: translateY(3px) rotate(-1deg);
  }

  50% {
    transform: translateY(-8px) rotate(1deg);
  }
}

@keyframes scene-tag-float {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-7px);
  }
}

@media (max-width: 1100px) and (min-width: 901px) {
  .login-scene__table {
    block-size: 240px;
    inline-size: 240px;
  }

  .login-scene__plate {
    padding: 11px;
    inset: 42px;
  }

  .login-scene__plate-rim {
    padding: 9px;
  }

  .login-scene__cutlery {
    block-size: 120px;
    inline-size: 16px;
    inset-block-start: 76px;
  }

  .login-scene__coaster {
    inset-block-start: 10px;
    inset-inline-end: 10px;
  }

  .login-scene__tag {
    padding: 8px;
    font-size: 12px;
    gap: 7px;
  }

  .login-scene__tag--team {
    inset-inline-end: -4%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .login-scene * {
    animation: none;
  }
}
</style>
