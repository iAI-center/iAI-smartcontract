# Network configurations
POLYGON_TESTNET := polygonTestnet
FORKING_POLYGON_TESTNET := forkingPolygonTestnet

# Input directory for Polygon network family
POLYGON_INPUT_DIR := polygon-testnet

# Contracts directory
CONTRACTS_DIR := ../contracts

# Input file paths for Polygon network family
POLYGON_IAI_TOKEN_INPUT := $(POLYGON_INPUT_DIR)/iai-token.json
POLYGON_CALLHELPER_INPUT := $(POLYGON_INPUT_DIR)/callhelper.json
POLYGON_REWARD_DIST_INPUT := $(POLYGON_INPUT_DIR)/reward-distributor.json
POLYGON_ADD_FUNDS_INPUT := $(POLYGON_INPUT_DIR)/add-funds.json

# Task templates
define run-script
npx ts-node --files ../scripts/cmd/$(1).ts --input ../scripts/input/$(2) --network $(3) $(4)
endef

define run-contract-deployment
$(call run-script,$(1),$(2),$(3),--contracts $(CONTRACTS_DIR))
endef

define run-deploy-all
npx ts-node --files ../scripts/cmd/$(1).ts --network $(2) --contracts $(CONTRACTS_DIR)
endef

# Polygon Testnet specific tasks
deploy-iai-token-polygon-testnet:
	$(call run-contract-deployment,deploy-iai-token,$(POLYGON_IAI_TOKEN_INPUT),$(POLYGON_TESTNET))

deploy-callhelper-polygon-testnet:
	$(call run-contract-deployment,deploy-callhelper,$(POLYGON_CALLHELPER_INPUT),$(POLYGON_TESTNET))

deploy-reward-distributor-polygon-testnet:
	$(call run-contract-deployment,deploy-reward-distributor,$(POLYGON_REWARD_DIST_INPUT),$(POLYGON_TESTNET))

add-funds-polygon-testnet:
	$(call run-script,add-funds-to-reward-distributor,$(POLYGON_ADD_FUNDS_INPUT),$(POLYGON_TESTNET))

deploy-all-polygon-testnet:
	$(call run-deploy-all,deploy-all,$(POLYGON_TESTNET))

# Forking Polygon Testnet specific tasks (using same input files)
deploy-iai-token-forking-polygon-testnet:
	$(call run-contract-deployment,deploy-iai-token,$(POLYGON_IAI_TOKEN_INPUT),$(FORKING_POLYGON_TESTNET))

deploy-callhelper-forking-polygon-testnet:
	$(call run-contract-deployment,deploy-callhelper,$(POLYGON_CALLHELPER_INPUT),$(FORKING_POLYGON_TESTNET))

deploy-reward-distributor-forking-polygon-testnet:
	$(call run-contract-deployment,deploy-reward-distributor,$(POLYGON_REWARD_DIST_INPUT),$(FORKING_POLYGON_TESTNET))

add-funds-forking-polygon-testnet:
	$(call run-script,add-funds-to-reward-distributor,$(POLYGON_ADD_FUNDS_INPUT),$(FORKING_POLYGON_TESTNET))

deploy-all-forking-polygon-testnet:
	$(call run-deploy-all,deploy-all,$(FORKING_POLYGON_TESTNET))
