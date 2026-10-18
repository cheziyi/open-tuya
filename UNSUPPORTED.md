# Unsupported

What no source pins down. Each entry says what is unknown, and what the code
does until a source or a capture settles it.

## LAN protocol

| What | Unknown | Until then |
| --- | --- | --- |
| A TCP frame from a real 3.4 device, a session key negotiation, and most 3.3 and 3.5 frames | The sources capture a 3.3 error, and a 3.5 query and its error, with their keys; for the rest, only decrypted payloads | Tests use those three, and frames computed by tinytuya's code and checked against tuyapi's |
| The largest frame a device sends | No source or capture shows it | `@open-tuya/local` closes the connection on a length field over 102,400: see [DESIGN.md](DESIGN.md#received-frames) |
| Which frames a device puts the version header on | Tuya's firmware puts it on its pushes; clients look for it on any frame | The simulator puts it on `STATUS` alone |
| What a 3.3 device sends back for a frame under the wrong key | tinytuya's scanner says "an encrypted rejection message"; no source shows its bytes | The simulator ignores the frame |
| The return code on a 3.4 device's write ack | 3.3 devices send 0, and Tuya's 3.5 firmware sends 1 even on success; no source shows 3.4 | The simulator sends 0; `LocalTuyaClient` judges an ack by its payload alone |
| A device that answers a read with "json obj data unvalid" (device22) | Which command reads it instead (CONTROL in tuyapi, CONTROL_NEW in localtuya), on which versions, and which data points to ask for. Tuya's 3.5 firmware sends the text when it has nothing to report yet, and on one camera the query that reads it changed its settings ([tinytuya#408](https://github.com/jasonacox/tinytuya/issues/408)) | `readDataPoints` rejects with `REQUEST_REJECTED` |

## Discovery

| What | Unknown | Until then |
| --- | --- | --- |
| A 3.1 or 3.2 broadcast | The one raw 3.1 broadcast captured has its product key cut short, so its CRC cannot be checked ([hass-localtuya#95](https://github.com/xZetsubou/hass-localtuya/pull/95)); no source captures a 3.2 one | `discoverDevices` does not listen on port 6666, and leaves out a device of either version |
| How often a device broadcasts | No source's code says. Users saw 3 to 6 s ([tuyapi#5](https://github.com/codetheweb/tuyapi/issues/5#issuecomment-348253790)), and some devices stop while a client is connected ([tinytuya#731](https://github.com/jasonacox/tinytuya/issues/731#issuecomment-5318435027)) | `discoverDevices` reports each broadcast as it comes; the simulator broadcasts when a test tells it to |
| What `token`, `wf_cfg` and `clientLink` in a broadcast mean | No source reads them | `discoverDevices` does not report them |
| Whether a 3.3 or 3.4 device answers a request | Only 3.5 firmware shows a device taking one | The simulator answers on 3.5 alone |
| A device's answer to a request, as bytes | Tuya's firmware builds it as its broadcast ([`cd3b764`](https://github.com/tuya/TuyaOpen/commit/cd3b764643ba2b3f797dec8b4629b083cc081da1)); no capture shows one | The simulator answers with its broadcast |

## Smart Life cloud

| What | Unknown | Until then |
| --- | --- | --- |
| A device's protocol version and LAN address | No field carries the version, and `ip` is the address the cloud sees, behind the home's router ([tuya-local](https://github.com/make-all/tuya-local/blob/22b2d4edcd0f266889d3b675118639cb90ed2e09/custom_components/tuya_local/config_flow.py#L345)) | `listDevices` reports neither; `discoverDevices` does |
| What a poll answers before the QR code is scanned, and how long a QR code lasts | Home Assistant and tuya-local check once, when the user says they scanned; Home Assistant says the code "expires in minutes" | `waitForScan` polls on through every answer but `E0020002` |
| A data point the cloud converts other than with `"default"` | Each conversion turns the device's value into the cloud's; no source turns it back | A read leaves it out, and a write rejects with `UNMAPPED_DATA_POINT`. A push carries it, as the device's own value |
| A device of a custom type, or with a relation that does not support local | The SDK then trusts none of its relations and listens to its `/sta` topic by code; no source shows how those codes map to IDs | The client maps no data point and subscribes to no push |
| The response's `sign` | No source computes it | It is ignored |
| Whether the cloud reads the MQTT link ID | The SDK sends `tuya-device-sharing-sdk-python.` and a UUID; no source sends another | The account sends the same form |
| A signed request whole | A log shows the response, never the request ID and refresh token that sign it | Tests use requests computed by the SDK's own code |
| A push other than protocol 4 | No capture shows one | It is ignored |

## Tuya developer platform

| What | Unknown | Until then |
| --- | --- | --- |
| A captured `shadow/properties/issue` request and its answer | Tuya calls the endpoint ([tuya-connector](https://github.com/tuya/tuya-connector/commit/25424c594135e8c5f4c684a0b7cce8fc7b4fcca6)) and documents its values in the thing model's own terms ([tuya-openclaw-skills](https://github.com/tuya/tuya-openclaw-skills/commit/79292c594cfba383555b4f465e835132136f0ea6)), but no capture shows one | A write sends the caller's values as they are |
| A device's protocol version and LAN address | No response carries the version, and `ip` is the address the cloud sees | `listDevices` reports neither; `discoverDevices` does |
| A pushed message's `sign` | No source computes it | It is ignored; the GCM tag stands for it |
| A push other than protocol 4 | Protocol 20 carries `online`, `offline` and other events ([tuya-homebridge#401](https://github.com/tuya/tuya-homebridge/issues/401)); `TuyaClient` has nothing to hand them to | They are ignored |
| Whether `/v1.0/users/{uid}/devices` pages | No source or capture shows a page past the first | `listDevices` with `viaDeviceId` reads one page |

## Device catalog

`@open-tuya/devices` converts a tuya-local device file whole or not at all.
These use a feature the conversion does not take yet, and are left out of the
catalog until it does.

<!-- Generated by packages/devices/scripts/importTuyaLocal.ts. -->

| tuya-local feature | Devices | Device files |
| --- | --- | --- |
| `available`: a value offered only while another data point allows it | 61 | alecoair_d12_dehumidifier, alen_35i_airpurifier, aquaviva_avh15s_heatpump, arcelik_ahphmm_comboheatpump, aubess_1gang_switch, axen_ks100w_heatpump, beltax_aircondition, beok_tol47v2_thermostat, calibo_smart_ceiling_fan, carrier_esteredgefxi_airconditioner, cecotec_congax70_vacuum, chiltrix_cx50_comboheatpump, confortotal_minisplit, costway_portable_ac, della_airconditioner, duux_blizzard_portable_aircon, earu_k6h3aw_thermostat, eberg_qubo_q40hd_heatpump, eglo_ceiling_fan, elechico_ccst6001_thermostat, elko_cfmtb_thermostat, essentials_wall_thermostat, etop_htch_pro_thermostat, eurom_ac5201_airconditioner, fairland_x20_poolheatpump, fersk_vind_2_climate, fisher_summer_air_conditioner, garza_aspen_thermostat, goldair_portable_airconditioner, henden_essential_pool_heatpump, htw_ix75b_airconditioner, hy_combo_heatpump, intaflo_intabloc_airwaterheatpump, inventor_risepro8l_dehumidifier, lytmi_hdmisync_backlight, madimack_elite_v3_heatpump, madimack_elitev4_heatpump, madimack_inverflow_pro, meaco_cirro_airconditioner, meacocool_mcseries_airconditioner, moes_quad_switch, nulite_nlb245_heatpump, ovlaim_ceiling_fan_light, powerworld_pw040_waterheatpump, powerworld_pw060_waterheatpump, proscenic_850t_vacuum, pureborne_htf1001_towerfan, realme_techlife_vacuum, rohnson_r28858_airfryer, smartevchargers_10a_evcharger, smartplug_usb, solareast_aurora2_heatpump, suntec_coolfix_airconditioner, temprium_pac011_airconditioner, thermoval_aquati_waterheater, trucool_tc1160_airconditioner, turbro_75000btu_poolheatpump, vaco_mobyblue_heatpump, vonroc_wifi_heater, woods_cortina_airconditioner, yuhome_laundry_rack |
| `default`: the value a bare turn-on writes | 12 | breville_smartmistglowconnect_humidifier, comon_lights, erz04c_energy_meter, feyree_ev_charger, inkbird_int12bw_thermometer, ivation_50pt_dehumidifier, motion_sensor_light, orion_outdoor_siren, sirena_ws902plus_siren, thermex_if50v_waterheater, tylohelo_sl2_sauna, zx_g30_alarm |
| `format` on a data point that is not hex or base64 | 1 | depuley_smart_ceiling_fan |
| `invalid`: a value that cannot be written in some states | 34 | airton_aircon, alecoair_d16_dehumidifier, beok_tgr81_thermostat_c, cooper_hunter_air_conditioner, create_warmtoweladvance_heater, ct1203_clamp_meter, denver_shp200mk2_dualsmartplug, dry_pury_evo_dehumidifier, dual_power_monitor_smartplugv2, eesee_adam_dehumidifier, electriq_12wminv_heatpump, electriq_desd9lw_dehumidifier, etowel_mini04_thermostat, goldair_dehumidifier, goldair_gpph_heater, greenmigo_alpha_q25_pro_wifi, hellnar_heatpump, howeall_register_booster_fan, hysen_hy08acf_thermostat, kogan_dehumidifier, kogan_kasthfp2kwa_towerheater, mellerware_comfy_radiator, pj1103_clamp_meter, powerstrip_3outlet_powermonitor, qlima_sc7035s_air_conditioner, saswell_t29utk_thermostat, sencor_air_conditioner, setti_czajnik_kettle, shinco_30d_dehumidifier, smart_p01_socket, starlight_heatpump, warmehaus_afd02tj_thermostat_c, wetair_wch750_heater, wilfa_haze_hu400bc_humidifier |
| `utf16b64`: a data point of that type | 33 | advwin_6l_petfeeder, aixishs_big_siren, ajxml_1080p_videodoorbell, avidsen_soriami400_solarinverter, bcom_intercom_camera, calltou_caregiver_pagerbutton, cpvan_cp2w_alarm, emos_ip300_camera, etiger_s6_alarmsystem, feelneedy_plfp01_petfeeder, frienhund_acf180wa_dualfeeder, fuers_videodoorbell, furpipi_camera_petfeeder, gautone_pg103_alarm, geeni_wp005_pettreatcamera, igethome_ds1_videodoorbell, inkbird_c236t_thermostat, kerui_120db_sirenalarm, kerui_200w_camera, kerui_300w_camera, lscsmartconnect_outdoorcamera, meowmatic_petfeeder, moes_wcmp52_camera, ningbo_bf314a_petfeeder, nityers_titan_petfeeder, orno_sigo_doorbell, pgst_pw150_alarm, rhpd10_doorbell_camera, rl_video_lock, smcm_doorbellpro_camera, tolviviov_dp21w_alarmpanel, whm04_doorbell, yakry_camera_petfeeder |
| a `constraint` read through a mask or a mapping | 3 | inkbird_ibs_m1s, nedis_pilldispenser, owon_pc341_energymeter |
| a `mask` of an odd number of hex digits on a control that can be written | 1 | mirabella_geniopixel_light |
| a condition's mapping of the value while absent | 1 | tefal_xplorer_vacuum |
| a number conversion on one raw value | 16 | aeratron_ae3plus_fan, aerium_dh12w_dehumidifier, ailrinni_fingerprint_lock, ble_pulido_p13_lock, ble_ysgbs01_lock, bstuokey_access_keypad, bstuokey_invisible_lock, gainsboroughliberty_entrance_lock, kogan_bladeless_fan, orion_dl033ha_lock, primebras_athenas_lock, prodotec_airquality_monitor, treatlife_ds02_fan, weeket_kes5211tece_kettle, wood_wdd90_dehumidifier, woods_mrd25gw_dehumidifier |
| more than one default mapping | 1 | orbegozo_rrw_emisor_termico |
| not valid YAML 1.2 | 1 | poolsana_heatpump |
| one data point given two types | 56 | advwin_humidifier, bkzo_modern_ceiling_fanlight, blitzwolf_bw_lt31, brizlabs_string_lights, brokton_brst12_airconditioner, calex_s45cleare27_light, colemanmach_rvp9420_thermostat, dekala_lumos_alarm_clock, door_peephole_camera, dreamlight_led_strip, dreamlight_rgb_strip, duracomfort_dh50pwm_dehumidifier, electriq_cd12pro_dehumidifier, electriq_cd12pwv2_dehumidifier, electriq_pd45e_dehumidifier, em3378_weather_station, emylo_energy_meter, enbrighten_curtainlights, flinq_smart_multicolor_light, galaxy_projector_light, garage_door_camera, hdmi_ambient65_light, hdmi_sync_light, holman_wx1_taptimer, holman_wx2_taptimer, homemate_ptzcamera, ih001_led_controller, inkbird_ibs_m2, inkbird_ivc001w_fan, inkbird_sousvide_cooker, keyun_rgb_ceilingfan, light_string, lsc_neon_ledstrip, lsc_smart_ceiling_light, lscsmartconnect_rgbcct_bulb, marpou_ceiling_lamp_ledlight, orison_chanfok_neo_fan_light, outon_smart_lamp, poolex_vertigo_heatpump, powerworld_pw58330_waterheater, powerworld_pw58410_hvaconly, powerworld_pw58410_waterheater, rgb_led_strip, rgb_nightlight_outlet, rgbcw_lightbulb, rgbcw_lightbulb_xld_cl002, rgbw_lightbulbv2, rgbwc_lightbulb, smart_led_strip, swc33v2_cbu_breaker, t5e_wf_thermostat, techinc_smart_3m_neon_strip, th08_temperature_and_humidity_sensor, tv_backlights, vidos_m13xt_videodoorbell, vjulesv_sk17_galaxyprojector |

<!-- End of generated list. -->
