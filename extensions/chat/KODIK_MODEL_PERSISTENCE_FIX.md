# Kodik Model Selection Persistence Fix

## Overview

This document details the complete solution implemented to fix Kodik model selection persistence issues in the Cline extension. The problem was that when users selected Kodik models (like qwen-max, qwen3-coder-plus, etc.), their selections would not persist after window reloads or VS Code restarts.

## Problem Analysis

The issue was identified in two critical parts of the configuration persistence pipeline:

1. **Proto Conversion Layer**: Missing Kodik fields in gRPC protocol buffer conversions
2. **Cache Retrieval Layer**: Missing Kodik fields when loading saved configuration from VS Code global state

## Files Modified

### 1. `src/api/conversion/api-configuration-conversion.ts`

**Purpose**: Handles conversion between application API configuration and protocol buffer format for gRPC communication.

**Issue**: The conversion functions were missing Kodik model fields, causing them to be lost during gRPC calls.

**Changes Made**:

#### In `convertApiConfigurationToProto` function

```typescript
// Added missing Kodik fields
planModeKodikModelId: config.planModeKodikModelId,
planModeKodikModelInfo: config.planModeKodikModelInfo ? convertModelInfoToProtoOpenRouter(config.planModeKodikModelInfo) : undefined,
actModeKodikModelId: config.actModeKodikModelId,
actModeKodikModelInfo: config.actModeKodikModelInfo ? convertModelInfoToProtoOpenRouter(config.actModeKodikModelInfo) : undefined,
```

#### In `convertProtoToApiConfiguration` function

```typescript
// Added missing Kodik fields
planModeKodikModelId: proto.planModeKodikModelId,
planModeKodikModelInfo: proto.planModeKodikModelInfo ? convertProtoToModelInfo(proto.planModeKodikModelInfo) : undefined,
actModeKodikModelId: proto.actModeKodikModelId,
actModeKodikModelInfo: proto.actModeKodikModelInfo ? convertProtoToModelInfo(proto.actModeKodikModelInfo) : undefined,
```

### 2. `src/core/storage/StateManager.ts`

**Purpose**: Manages persistence of application state using VS Code's global state storage.

**Issue**: The `constructApiConfigurationFromCache` method was not retrieving Kodik model fields from the cache, causing them to be lost on application restart.

**Changes Made**:

#### In `constructApiConfigurationFromCache` method

```typescript
// Added missing Kodik fields retrieval
planModeKodikModelId: globalStateCache.get("planModeKodikModelId"),
planModeKodikModelInfo: globalStateCache.get("planModeKodikModelInfo"),
actModeKodikModelId: globalStateCache.get("actModeKodikModelId"),
actModeKodikModelInfo: globalStateCache.get("actModeKodikModelInfo"),
```

## Technical Details

### Configuration Persistence Flow

The complete flow for model selection persistence works as follows:

1. **User Selection**: User selects a Kodik model in the UI
2. **Frontend State Update**: React state is updated with the new model selection
3. **Proto Conversion**: Configuration is converted to protocol buffer format using `convertApiConfigurationToProto`
4. **gRPC Call**: Configuration is sent to backend via `updateApiConfigurationProto`
5. **Backend Storage**: Backend receives proto, converts back to app format, and stores in VS Code global state
6. **Cache Storage**: `setApiConfiguration` method stores all fields including Kodik fields
7. **Window Reload/Restart**: VS Code restarts or window reloads
8. **Cache Retrieval**: `constructApiConfigurationFromCache` retrieves stored configuration
9. **Frontend Display**: UI displays the persisted model selection

### Root Cause Analysis

**Before the fix**:

- Step 3: ❌ Kodik fields were lost during proto conversion
- Step 8: ❌ Kodik fields were not retrieved from cache
- Result: Model selections appeared to work but didn't persist

**After the fix**:

- Step 3: ✅ Kodik fields properly converted to/from proto format
- Step 8: ✅ Kodik fields properly retrieved from cache
- Result: Model selections persist across sessions

## Fields Added

The following fields were added to ensure complete Kodik model persistence:

### Plan Mode Fields

- `planModeKodikModelId`: String ID of the selected planning mode Kodik model
- `planModeKodikModelInfo`: Object containing model metadata (maxTokens, contextWindow, description, etc.)

### Act Mode Fields

- `actModeKodikModelId`: String ID of the selected action mode Kodik model
- `actModeKodikModelInfo`: Object containing model metadata (maxTokens, contextWindow, description, etc.)

## Testing

To verify the fix works:

1. **Select a Kodik model**: Choose any Kodik model (qwen-max, qwen3-coder-plus, deepseek/deepseek-chat-v3.1)
2. **Reload window**: Use `Ctrl+Shift+P` → "Developer: Reload Window"
3. **Verify persistence**: The selected Kodik model should still be selected after reload
4. **Check console logs**: Look for debug logs showing proper configuration loading

## Debug Logs

The fix includes comprehensive debugging that shows:

```javascript
// Proto conversion logs
useApiConfigurationHandlers: Proto config created: {
  "actModeKodikModelId": "qwen-max",
  "actModeKodikModelInfo": { ... }
}

// Backend storage logs
[APICONFIG] After update - stored config: {
  "actModeKodikModelId": "qwen-max",
  "actModeKodikModelInfo": { ... }
}

// State distribution logs
[DEBUG] postStateToWebview sending apiConfiguration: {
  "actModeKodikModelId": "qwen-max",
  "actModeKodikModelInfo": { ... }
}
```

## Impact

This fix ensures:

- ✅ Kodik model selections persist across window reloads
- ✅ Kodik model selections persist across VS Code restarts
- ✅ Complete feature parity with other model providers (OpenAI, Anthropic, etc.)
- ✅ Proper separation between Plan and Act mode model selections
- ✅ Full model metadata persistence (context windows, pricing, capabilities)

## Related Issues

This fix resolves:

- Model selections reverting to defaults after window reload
- API provider displaying as "openrouter" instead of "kodik"  
- Missing model information in the UI after restart
- Inconsistent model persistence behavior compared to other providers

## Maintenance Notes

When adding new model provider fields in the future:

1. Add fields to `convertApiConfigurationToProto` and `convertProtoToApiConfiguration`
2. Add fields to `constructApiConfigurationFromCache` method
3. Ensure fields are handled in `setApiConfiguration` method (usually automatic)
4. Test persistence across window reloads
