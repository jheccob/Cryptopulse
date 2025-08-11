import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Settings, TestTube } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { type Configuration } from '@shared/schema';

interface ConfigPanelProps {
  config: Configuration;
}

export function ConfigPanel({ config }: ConfigPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState(config);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateConfigMutation = useMutation({
    mutationFn: async (data: Partial<Configuration>) => {
      const response = await apiRequest('PATCH', `/api/config/${config.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Configuration Updated",
        description: "Your trading parameters have been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/config'] });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update configuration. Please try again.",
        variant: "destructive",
      });
    },
  });

  const testTelegramMutation = useMutation({
    mutationFn: async (data: { token: string; chatId: string }) => {
      const response = await apiRequest('POST', '/api/telegram/test', data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.connected ? "Telegram Connected" : "Connection Failed",
        description: data.connected 
          ? "Test message sent successfully!" 
          : "Failed to connect to Telegram. Check your credentials.",
        variant: data.connected ? "default" : "destructive",
      });
    },
    onError: () => {
      toast({
        title: "Test Failed",
        description: "Failed to test Telegram connection.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    const updates = {
      symbol: formData.symbol,
      timeframe: formData.timeframe,
      macdFast: formData.macdFast,
      macdSlow: formData.macdSlow,
      macdSignal: formData.macdSignal,
      rsiPeriod: formData.rsiPeriod,
      rsiLower: formData.rsiLower,
      rsiUpper: formData.rsiUpper,
      volumePeriod: formData.volumePeriod,
      alertCooldown: formData.alertCooldown,
      telegramEnabled: formData.telegramEnabled,
      telegramToken: formData.telegramToken,
      telegramChatId: formData.telegramChatId,
    };
    
    updateConfigMutation.mutate(updates);
  };

  const handleTestTelegram = () => {
    if (!formData.telegramToken || !formData.telegramChatId) {
      toast({
        title: "Missing Credentials",
        description: "Please enter both Telegram token and chat ID.",
        variant: "destructive",
      });
      return;
    }

    testTelegramMutation.mutate({
      token: formData.telegramToken,
      chatId: formData.telegramChatId,
    });
  };

  const handleReset = () => {
    setFormData({
      ...config,
      symbol: 'XLM/USDT',
      timeframe: '5m',
      macdFast: 8,
      macdSlow: 17,
      macdSignal: 9,
      rsiPeriod: 14,
      rsiLower: 20,
      rsiUpper: 80,
      volumePeriod: 20,
      alertCooldown: 5,
    });
  };

  return (
    <Card className="bg-trading-surface border-trading-border">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-trading-surface-light transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Settings className="w-5 h-5 text-trading-primary" />
                <div>
                  <CardTitle className="text-lg text-trading-text">Advanced Configuration</CardTitle>
                  <p className="text-sm text-trading-text-secondary">
                    Customize technical indicators and alert parameters
                  </p>
                </div>
              </div>
              <ChevronDown 
                className={`w-5 h-5 text-trading-text-secondary transition-transform ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* MACD Settings */}
              <div className="space-y-4">
                <h4 className="font-semibold text-trading-text">MACD Parameters</h4>
                <div>
                  <Label className="text-xs text-trading-text-secondary">Fast Period</Label>
                  <Input
                    type="number"
                    value={formData.macdFast}
                    onChange={(e) => setFormData(prev => ({ ...prev, macdFast: parseInt(e.target.value) || 8 }))}
                    className="bg-trading-surface-light border-trading-border text-trading-text"
                  />
                </div>
                <div>
                  <Label className="text-xs text-trading-text-secondary">Slow Period</Label>
                  <Input
                    type="number"
                    value={formData.macdSlow}
                    onChange={(e) => setFormData(prev => ({ ...prev, macdSlow: parseInt(e.target.value) || 17 }))}
                    className="bg-trading-surface-light border-trading-border text-trading-text"
                  />
                </div>
                <div>
                  <Label className="text-xs text-trading-text-secondary">Signal Period</Label>
                  <Input
                    type="number"
                    value={formData.macdSignal}
                    onChange={(e) => setFormData(prev => ({ ...prev, macdSignal: parseInt(e.target.value) || 9 }))}
                    className="bg-trading-surface-light border-trading-border text-trading-text"
                  />
                </div>
              </div>

              {/* RSI Settings */}
              <div className="space-y-4">
                <h4 className="font-semibold text-trading-text">RSI Parameters</h4>
                <div>
                  <Label className="text-xs text-trading-text-secondary">Period</Label>
                  <Input
                    type="number"
                    value={formData.rsiPeriod}
                    onChange={(e) => setFormData(prev => ({ ...prev, rsiPeriod: parseInt(e.target.value) || 14 }))}
                    className="bg-trading-surface-light border-trading-border text-trading-text"
                  />
                </div>
                <div>
                  <Label className="text-xs text-trading-text-secondary">Lower Threshold</Label>
                  <Input
                    type="number"
                    value={formData.rsiLower}
                    onChange={(e) => setFormData(prev => ({ ...prev, rsiLower: parseInt(e.target.value) || 20 }))}
                    className="bg-trading-surface-light border-trading-border text-trading-text"
                  />
                </div>
                <div>
                  <Label className="text-xs text-trading-text-secondary">Upper Threshold</Label>
                  <Input
                    type="number"
                    value={formData.rsiUpper}
                    onChange={(e) => setFormData(prev => ({ ...prev, rsiUpper: parseInt(e.target.value) || 80 }))}
                    className="bg-trading-surface-light border-trading-border text-trading-text"
                  />
                </div>
              </div>

              {/* Volume and Alert Settings */}
              <div className="space-y-4">
                <h4 className="font-semibold text-trading-text">Trading & Alerts</h4>
                <div>
                  <Label className="text-xs text-trading-text-secondary">Trading Pair</Label>
                  <Select
                    value={formData.symbol}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, symbol: value }))}
                  >
                    <SelectTrigger className="bg-trading-surface-light border-trading-border text-trading-text">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="XLM/USDT">XLM/USDT</SelectItem>
                      <SelectItem value="BTC/USDT">BTC/USDT</SelectItem>
                      <SelectItem value="ETH/USDT">ETH/USDT</SelectItem>
                      <SelectItem value="ADA/USDT">ADA/USDT</SelectItem>
                      <SelectItem value="DOT/USDT">DOT/USDT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-trading-text-secondary">Timeframe</Label>
                  <Select
                    value={formData.timeframe}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, timeframe: value }))}
                  >
                    <SelectTrigger className="bg-trading-surface-light border-trading-border text-trading-text">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5m">5 minutes</SelectItem>
                      <SelectItem value="15m">15 minutes</SelectItem>
                      <SelectItem value="1h">1 hour</SelectItem>
                      <SelectItem value="4h">4 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-trading-text-secondary">Alert Cooldown (minutes)</Label>
                  <Input
                    type="number"
                    value={formData.alertCooldown}
                    onChange={(e) => setFormData(prev => ({ ...prev, alertCooldown: parseInt(e.target.value) || 5 }))}
                    className="bg-trading-surface-light border-trading-border text-trading-text"
                  />
                </div>
              </div>

              {/* Telegram Settings */}
              <div className="space-y-4 md:col-span-2 lg:col-span-3">
                <h4 className="font-semibold text-trading-text">Telegram Notifications</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={formData.telegramEnabled}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, telegramEnabled: checked }))}
                    />
                    <Label className="text-sm text-trading-text-secondary">Enable Telegram Alerts</Label>
                  </div>
                  <div>
                    <Label className="text-xs text-trading-text-secondary">Bot Token</Label>
                    <Input
                      type="text"
                      value={formData.telegramToken || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, telegramToken: e.target.value }))}
                      placeholder="Bot token from BotFather"
                      className="bg-trading-surface-light border-trading-border text-trading-text font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-trading-text-secondary">Chat ID</Label>
                    <div className="flex space-x-2">
                      <Input
                        type="text"
                        value={formData.telegramChatId || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, telegramChatId: e.target.value }))}
                        placeholder="Your chat ID"
                        className="bg-trading-surface-light border-trading-border text-trading-text font-mono text-sm"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleTestTelegram}
                        disabled={testTelegramMutation.isPending}
                        className="bg-trading-surface-light border-trading-border text-trading-text hover:bg-trading-surface"
                      >
                        <TestTube className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-3 mt-6 pt-6 border-t border-trading-border">
              <Button
                type="button"
                variant="ghost"
                onClick={handleReset}
                className="text-trading-text-secondary hover:text-trading-text"
              >
                Reset to Defaults
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateConfigMutation.isPending}
                className="bg-trading-primary hover:bg-blue-600 text-white"
              >
                {updateConfigMutation.isPending ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
